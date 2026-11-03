// WHICH question the console is judging — the one derivation every round shares.
//
// This used to be one nested ternary (~20 lines) inside useConsoleModel, where
// "which question do the ledger, the rail and the commits read?" was answered
// three times with three different expressions. It is a table now: one round
// per case, one question per case, and the rule for a stale click is explicit.
//
// The scope is what makes a stale pick unreadable instead of needing an effect
// to clear it: the returned ids are compared at READ time, so moving to another
// question simply reads as "nothing selected".
import type { ConsoleQuestion } from "@/lib/live"

export interface JudgingIds {
    /** the question the ledger + rail describe (null: nothing to judge) */
    judgingId: string | null
    /** ve-dich: the open question whose VERDICTS are being staged */
    resolvingId: string | null
    /** giai-ma: the keyword question — judged between hint windows, no window needed */
    keywordQuestionId: string | null
}

export interface JudgingInput {
    roundId: string
    questions: ConsoleQuestion[]
    /** the open questions' ids, in the engine's order */
    openIds: readonly string[]
    /** the card the operator last clicked in the ledger (khoi-dong S2 / but-pha S4) */
    selectedQ: string | null
}

const firstOrNull = (ids: readonly string[]): string | null => (ids.length > 0 ? ids[0] : null)

/** giai-ma's keyword question: the first KEYWORD row of the round. */
function keywordQuestionIdOf(input: JudgingInput): string | null {
    if (input.roundId !== "giai-ma") return null
    const keyword = input.questions.find((q) => q.roundId === "giai-ma" && q.kind === "KEYWORD")
    return keyword?._id ?? null
}

/**
 * The questions this console is reading right now.
 *
 * Rules, per round family:
 *  · a click-scoped round (khởi động's S2, bút phá's S4) reads the CLICKED
 *    question when it is still open, else the first open one — a click that
 *    outlived its window falls back instead of pointing at a dead question;
 *  · giải mã reads the OPEN hint window, and between windows the keyword drafts
 *    (that is what Đúng từ khoá judges);
 *  · về đích reads the open TURN's question — nothing else is resolvable.
 */
export function judgingIdsOf(input: JudgingInput): JudgingIds {
    const keywordQuestionId = keywordQuestionIdOf(input)
    const clicked = input.selectedQ !== null && input.openIds.includes(input.selectedQ) ? input.selectedQ : null

    switch (input.roundId) {
        case "khoi-dong":
        case "but-pha":
            return { judgingId: clicked ?? firstOrNull(input.openIds), resolvingId: null, keywordQuestionId }
        case "giai-ma":
            return { judgingId: firstOrNull(input.openIds) ?? keywordQuestionId, resolvingId: null, keywordQuestionId }
        case "ve-dich":
            return { judgingId: null, resolvingId: firstOrNull(input.openIds), keywordQuestionId }
        default:
            return { judgingId: null, resolvingId: null, keywordQuestionId }
    }
}

/** The verdict target: the clicked card if it answered, else the first answerer. */
export function targetOf(answererIds: readonly string[], selectedPlayer: string | null): string | null {
    if (selectedPlayer !== null && answererIds.includes(selectedPlayer)) return selectedPlayer
    return firstOrNull(answererIds)
}
