// The console's ACTION contract — a hand-written mirror of the backend's
// LiveActionSchema (backend/src/modules/live/actions.ts). The route validates
// every POST /live/actions body against that schema; this union lets the
// compiler validate it BEFORE the round trip.
//
// Change one, change both:
//   - backend:  add the action to LiveActionSchema
//               (locked by backend/tests/unit/live/live-action-schema.test.ts)
//   - frontend: add it here; every send site becomes a compiler error until
//               it knows the new shape — that is the point of this file.
//
// Deliberately ABSENT: ve-dich.pick / pickBatch / buzz. Those are player-door
// actions, built server-side from a player's own command — the route refuses
// them (see the backend contract test), and so does this union: a console
// screen cannot claim a playerId through them.
import type { ConsoleQuestion } from "./live"

/** One player's verdict, as the judging commits send it. */
export interface Verdict {
    playerId: string
    correct: boolean
}

export type LiveAction =
    // ── giai-ma ────────────────────────────────────────────────────────────────
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
    /** The console declares a power for the player whose turn it is. */
    | { kind: "ve-dich.declarePower"; playerId: string; power: "STAR" | "ASSIGN"; targetId?: string }
    // ── match-level (not bound to a round) ─────────────────────────────────────
    | { kind: "round.goTo"; roundId: string }
    | { kind: "score.adjust"; userId: string; delta: number; reason: string }
    /** Hiện đáp án — reveal one question's correct answer to every screen. */
    | { kind: "reveal.answer"; questionId: string }

/**
 * The `start` action for a round — the ONE dynamic action: the kind is
 * `${roundId}.start`, so it is built here, in a switch the compiler checks
 * member by member, never from a template string at the call site.
 *
 * Returns null for a round this contract does not know: such a start would be
 * refused by the backend schema anyway (400), so the navigator navigates
 * without it instead of sending a guaranteed refusal.
 *
 * `phase: 2` skips the untouched phase 1 in the SAME start (the engine refuses
 * a phase-1 skip on an already-touched round); phase 1 is the default and is
 * never sent.
 */
export function startAction(
    roundId: string,
    opts: { phase?: 1 | 2; playerIds: string[]; questions: ConsoleQuestion[] }
): LiveAction | null {
    const { phase, playerIds, questions } = opts
    switch (roundId) {
        case "giai-ma": {
            // The hint order the engine expects: the frozen set's non-keyword
            // questions, by position — resolved here the way the server would.
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
