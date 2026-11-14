import type { LobbyData, VeDichConsole } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import { startAction } from "@/lib/live-actions"
import { ApiError } from "@shared/lib/api"
import { endRoundPlanOf, nextQuestionPlanOf, roundModuleOf } from "@/rounds"
import { navigatorStartPlan } from "../navigator-plan"
import type { ConsoleJudging } from "./use-console-judging"
import type { ConsoleNav } from "./use-console-nav"
import type { ConsoleTransport } from "./use-console-transport"

export interface ConsolePlans {
    hetLuot: () => void
    backToLobby: () => void
    pickQuestion: () => void
    onStart: (roundId: string, phase?: 1 | 2) => void
}

interface ConsolePlansInput {
    transport: ConsoleTransport
    judging: ConsoleJudging
    veDich: VeDichConsole | null
    /** the phase the live round is on, so a button for the other one can start it */
    currentPhase: 1 | 2 | null
    lobby: LobbyData | null
    nav: Pick<ConsoleNav, "enterRound" | "backToWaiting">
    /** why the last start was refused — null once one lands */
    onStartError: (message: string | null) => void
}

function refusalOf(error: unknown): string {
    const message = error instanceof Error ? error.message : "Không bắt đầu được vòng"
    const details = error instanceof ApiError ? error.details ?? [] : []
    return [message, ...details].join(" — ")
}

export function useConsolePlans(input: ConsolePlansInput): ConsolePlans {
    const { transport, judging } = input
    const { roundId, stage, open, questions, userSeats, byId, send, sendChain } = transport
    const openIds = open.map((q) => q.questionId)

    const planInput = () => ({
        stage,
        hasOralRun: Boolean(transport.projection?.oral),
        openIds,
        openQuestionPosition: open.length > 0 ? byId(open[0].questionId)?.position ?? null : null,
        rows: judging.rows,
        overrides: judging.overrides,
    })

    const run = (plan: LiveAction[]) => {
        if (plan.length > 1) return void sendChain(plan)
        if (plan.length === 1) return send(plan[0])
    }

    const hetLuot = () => {
        const veDich = input.veDich
        if (!veDich || openIds.length === 0) return
        const qid = openIds[0]
        const action = roundModuleOf(roundId)?.hetLuotAction?.({
            phase: veDich.phase,
            answererVerdict: veDich.answererId ? judging.verdictOf(qid, veDich.answererId) : null,
            buzzerId: veDich.buzzerId,
            buzzerVerdict: veDich.buzzerId ? judging.verdictOf(qid, veDich.buzzerId) : null,
        }) ?? null
        if (action) send(action)
    }

    const backToLobby = () => {
        input.nav.backToWaiting()
        if (stage === "ended") return
        run(endRoundPlanOf(roundId, planInput()))
    }

    const pickQuestion = () => run(nextQuestionPlanOf(roundId, planInput()))

    const onStart = async (nextRoundId: string, phase?: 1 | 2) => {
        const lobby = input.lobby
        if (!lobby) return
        // every waiting-room entry starts the phase it names — so the start goes
        // out even when the round is live on the other one (or has no state yet,
        // where currentPhase is null). Re-picking the phase that is already
        // running leaves it alone instead of restarting it.
        const otherPhase = phase !== undefined
            && lobby.roundId === nextRoundId
            && input.currentPhase !== phase
        const plan = navigatorStartPlan(
            lobby,
            nextRoundId,
            startAction(nextRoundId, { phase, playerIds: userSeats, questions }),
            { force: otherPhase },
        )
        try {
            // The console enters the round only once the engine took it: a refused
            // start (bad bucket, stale version) keeps it in the waiting room with
            // the reason, instead of drawing a round no player was routed to.
            let expectedVersion = transport.v!.version
            for (const action of plan) {
                const res = await transport.writer.mutateAsync({ expectedVersion, action })
                expectedVersion = typeof res?.version === "number" ? res.version : expectedVersion + 1
            }
            input.nav.enterRound()
            input.onStartError(null)
        } catch (error) {
            input.onStartError(refusalOf(error))
        }
    }

    return { hetLuot, backToLobby, pickQuestion, onStart }
}
