// The console's PLANS — the four buttons that send an engine plan instead of a
// single action.
//
// Every one of them follows the same shape: build the plan with the round
// module's pure planner, then execute it (one action → `send`, several →
// `sendChain`, which threads the returned version through). The rule stays in
// `rounds/*`; this file only executes.
//
// What it READS, all of it owned elsewhere: the round snapshot and the writer
// (transport), the answers and the staged verdicts (judging), the waiting room
// payload (the lobby), and the two navigation moves a plan implies (nav).
//
// `planInput()` is rebuilt on EVERY call on purpose: `overrides` is read at
// click time (a verdict staged after render must be in the plan), so it must
// never be memoized.
import type { LobbyData, VeDichConsole } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import { startAction } from "@/lib/live-actions"
import { endRoundPlanOf, nextQuestionPlanOf, roundModuleOf } from "@/rounds"
import { navigatorStartPlan } from "../navigator-plan"
import type { ConsoleJudging } from "./use-console-judging"
import type { ConsoleNav } from "./use-console-nav"
import type { ConsoleTransport } from "./use-console-transport"

export interface ConsolePlans {
    /** ve-dich only: finish the current TURN — verdicts first */
    hetLuot: () => void
    /** Kết thúc (Về sảnh) = end the round in ONE press — the round module decides WHAT */
    backToLobby: () => void
    /** Tính giờ — bút phá picks the round's NEXT question */
    pickQuestion: () => void
    /** the rounds navigator's start click — one tested plan, one executor */
    onStart: (roundId: string, phase?: 1 | 2) => void
}

interface ConsolePlansInput {
    /** roundId, stage, open questions, byId, seats, questions, send/sendChain */
    transport: ConsoleTransport
    /** the anchor question's answers + the staged verdicts */
    judging: ConsoleJudging
    /** the round's console projection — null when another round is running */
    veDich: VeDichConsole | null
    /** the waiting room's payload; starts are refused without it */
    lobby: LobbyData | null
    nav: Pick<ConsoleNav, "enterRound" | "backToWaiting">
}

/** One plan, one executor: several actions thread versions, one is a plain send. */
export function useConsolePlans(input: ConsolePlansInput): ConsolePlans {
    const { transport, judging } = input
    const { roundId, stage, open, questions, userSeats, byId, send, sendChain } = transport
    const openIds = open.map((q) => q.questionId)

    /** Everything the round planners decide on — gathered once per call. */
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

    /** ve-dich only: finish the current TURN — verdicts first (the round module
     *  owns the rule; ending the ROUND is backToLobby's job). */
    const hetLuot = () => {
        const veDich = input.veDich
        if (!veDich || openIds.length === 0) return
        const qid = openIds[0]
        const action = roundModuleOf(roundId)?.hetLuotAction?.({
            answererVerdict: veDich.answererId ? judging.verdictOf(qid, veDich.answererId) : null,
            buzzerId: veDich.buzzerId,
            buzzerVerdict: veDich.buzzerId ? judging.verdictOf(qid, veDich.buzzerId) : null,
        }) ?? null
        if (action) send(action)
    }

    /** Kết thúc = end the round in ONE press — the round module decides WHAT. */
    const backToLobby = () => {
        // The ONE rule every round shares: Về sảnh lands on the waiting room.
        // The plan below still tidies the engine's state first (close the open
        // window, commit, end the round) — the navigation does not wait for it,
        // and does not depend on it existing.
        input.nav.backToWaiting()
        if (stage === "ended") return
        run(endRoundPlanOf(roundId, planInput()))
    }

    /** Tính giờ — bút phá picks a NEW question: commit the current one, advance, open. */
    const pickQuestion = () => run(nextQuestionPlanOf(roundId, planInput()))

    /** The rounds navigator's start click — one tested plan, one executor. */
    const onStart = (nextRoundId: string, phase?: 1 | 2) => {
        const lobby = input.lobby
        if (!lobby) return
        input.nav.enterRound()
        // The paired rounds' "· Chung/· Riêng" entry: skip the untouched
        // phase 1 in the SAME start action (the engine refuses a touched one).
        const start = startAction(nextRoundId, { phase, playerIds: userSeats, questions })
        run(navigatorStartPlan(lobby, nextRoundId, start))
    }

    return { hetLuot, backToLobby, pickQuestion, onStart }
}
