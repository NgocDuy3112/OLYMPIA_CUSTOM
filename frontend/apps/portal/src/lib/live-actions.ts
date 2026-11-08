import type { ConsoleQuestion } from "./live"

export interface Verdict {
    playerId: string
    correct: boolean
}

export type LiveAction =
    | { kind: "giai-ma.start"; playerIds: string[]; hintIds: string[] }
    | { kind: "giai-ma.openHint"; hintId: string }
    | { kind: "giai-ma.closeHintWindow" }
    | { kind: "giai-ma.resolveHint"; verdicts: Verdict[] }
    | { kind: "giai-ma.submitKeyword"; playerId: string; questionId: string; text: string; suggestion: "CORRECT" | "INCORRECT" }
    | { kind: "giai-ma.judgeKeyword"; playerId: string; questionId: string; correct: boolean }
    | { kind: "giai-ma.endRound" }
    // ── but-pha ────────────────────────────────────────────────────────────────
    | { kind: "but-pha.start" }
    | { kind: "but-pha.openQuestion" }
    | { kind: "but-pha.closeQuestion" }
    | { kind: "but-pha.endRound" }
    | { kind: "but-pha.finalize"; questionId: string; verdicts: Verdict[] }
    // ── khoi-dong ──────────────────────────────────────────────────────────────
    | { kind: "khoi-dong.start"; phase?: 1 | 2 }
    | { kind: "khoi-dong.recordOral"; correct: boolean; spentS: number }
    | { kind: "khoi-dong.timeOutRun" }
    | { kind: "khoi-dong.beginPhase2" }
    | { kind: "khoi-dong.startWindow" }
    | { kind: "khoi-dong.judge"; playerId: string; correct: boolean }
    | { kind: "khoi-dong.nextQuestion" }
    | { kind: "khoi-dong.endRound" }
    // ── ve-dich ────────────────────────────────────────────────────────────────
    | { kind: "ve-dich.start"; phase?: 1 | 2 }
    | { kind: "ve-dich.beginPhase2" }
    | { kind: "ve-dich.openQuestion"; questionId: string }
    | { kind: "ve-dich.closeCurrentAnswer" }
    | { kind: "ve-dich.lockBuzz" }
    | { kind: "ve-dich.resolve"; answerer: boolean; buzzer?: boolean }
    | { kind: "ve-dich.advanceTurn" }
    | { kind: "ve-dich.endRound" }
    /** The console declares a power for the player whose turn it is — pressed on
     *  the pick board BEFORE the question opens; `power: null` is the explicit
     *  "Không dùng quyền năng" (clears a staged choice). */
    | { kind: "ve-dich.declarePower"; playerId: string; power: "STAR" | "ASSIGN" | null; targetId?: string }
    /** The console picks for the turn player — the engine guards the playerId. */
    | { kind: "ve-dich.pick"; playerId: string; questionId: string }
    | { kind: "ve-dich.pickBatch"; playerId: string; questionIds: string[] }
    // ── match-level (not bound to a round) ─────────────────────────────────────
    | { kind: "round.goTo"; roundId: string }
    | { kind: "score.adjust"; userId: string; delta: number; reason: string }
    /** Hiện đáp án — reveal one question's correct answer to every screen. */
    | { kind: "reveal.answer"; questionId: string }

export function startAction(
    roundId: string,
    opts: { phase?: 1 | 2; playerIds: string[]; questions: ConsoleQuestion[] }
): LiveAction | null {
    const { phase, playerIds, questions } = opts
    switch (roundId) {
        case "giai-ma": {
            const hintIds = questions
                .filter((q) => q.roundId === "giai-ma" && q.kind !== "KEYWORD")
                .sort((a, b) => a.position - b.position)
                .map((q) => q._id)
            return { kind: "giai-ma.start", playerIds, hintIds }
        }
        case "khoi-dong":
            return phase === 2 ? { kind: "khoi-dong.start", phase: 2 } : { kind: "khoi-dong.start" }
        case "ve-dich":
            return phase === 2 ? { kind: "ve-dich.start", phase: 2 } : { kind: "ve-dich.start" }
        case "but-pha":
            return { kind: "but-pha.start" }
        default:
            return null
    }
}
