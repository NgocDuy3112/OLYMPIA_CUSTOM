import type { LobbyData, VeDichConsole } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import { startAction } from "@/lib/live-actions"
import { ApiError } from "@shared/lib/api"
import { setGlow, glowKeyOf } from "@shared/lib/glow"
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
    currentPhase: 1 | 2 | null
    lobby: LobbyData | null
    nav: Pick<ConsoleNav, "enterRound" | "backToWaiting">
    onStartError: (message: string | null) => void
}

function refusalOf(error: unknown): string {
    let message = "Không bắt đầu được vòng"
    if (error instanceof Error) message = error.message
    let details: string[] = []
    if (error instanceof ApiError) details = error.details ?? []
    return [message, ...details].join(" — ")
}

export function useConsolePlans(input: ConsolePlansInput): ConsolePlans {
    const { transport, judging } = input
    const { roundId, stage, open, questions, userSeats, byId, send, sendChain } = transport
    const openIds = open.map((q) => q.questionId)

    const planInput = () => {
        let openQuestionPosition: number | null = null
        if (open.length > 0) openQuestionPosition = byId(open[0].questionId)?.position ?? null
        return {
            stage,
            hasOralRun: Boolean(transport.projection?.oral),
            openIds,
            openQuestionPosition,
            rows: judging.rows,
            overrides: judging.overrides,
        }
    }

    const run = (plan: LiveAction[]) => {
        if (plan.length > 1) return void sendChain(plan)
        if (plan.length === 1) return send(plan[0])
    }

    const hetLuot = () => {
        const veDich = input.veDich
        if (!veDich || openIds.length === 0) return
        const qid = openIds[0]
        let answererVerdict: "CORRECT" | "INCORRECT" | null = null
        if (veDich.answererId) answererVerdict = judging.verdictOf(qid, veDich.answererId)
        let buzzerVerdict: "CORRECT" | "INCORRECT" | null = null
        if (veDich.buzzerId) buzzerVerdict = judging.verdictOf(qid, veDich.buzzerId)
        const action = roundModuleOf(roundId)?.hetLuotAction?.({
            phase: veDich.phase,
            answererVerdict,
            buzzerId: veDich.buzzerId,
            buzzerVerdict,
        }) ?? null
        if (action) send(action)
    }

    const backToLobby = () => {
        input.nav.backToWaiting()
        if (stage === "ended") return
        if (roundId === "khoi-dong" && stage === "phase1") {
            send({ kind: "round.waiting" })
            return
        }
        void sendChain([{ kind: "round.waiting" }, ...endRoundPlanOf(roundId, planInput())])
    }

    const pickQuestion = () => run(nextQuestionPlanOf(roundId, planInput()))

    const onStart = async (nextRoundId: string, phase?: 1 | 2) => {
        const lobby = input.lobby
        if (!lobby) return
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
            for (const action of plan) {
                await transport.writer.mutateAsync(action)
            }
            input.nav.enterRound()
            input.onStartError(null)
        } catch (error) {
            setGlow(glowKeyOf(roundId, stage))
            input.onStartError(refusalOf(error))
        }
    }

    return { hetLuot, backToLobby, pickQuestion, onStart }
}
