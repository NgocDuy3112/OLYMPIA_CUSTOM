// A rail card's STATE, as a class table. One place decides how "judged right",
// "judged wrong / locked", "this player buzzed first" and "waiting" look — the
// MC's rail and the player's rail read the same table, so a card means the same
// thing on both decks.
//
// The verbal rule (kept short on purpose):
//   correct        → BRIGHT (emerald, the only green on the board)
//   wrong / locked → GRAY  (muted, no hue at all)
//   buzzed first   → PURPLE, filled, with a DASHED WHITE outline (live answerer)
//   waiting        → PURPLE, tinted — the quiet version of the live card
//
// Colour alone is not the only cue: wrong cards fade, the winner's outline is
// dashed, so the states survive a colour-blind viewer and a projector.

export type RailCardState = "waiting" | "correct" | "wrong" | "buzzing"

/** Ring/outline tokens that must compose: selection is drawn ON TOP of state. */
const STATE: Record<RailCardState, string> = {
    // The bright one: emerald tint, emerald ring, emerald score.
    correct: "bg-emerald-50 ring-2 ring-emerald-500",
    // The quiet one: no hue at all.
    wrong: "bg-muted text-muted-foreground ring-1 ring-border opacity-70",
    // The live answerer: the SAME purple, filled — dashed white around it.
    buzzing: "bg-primary text-primary-foreground outline-2 outline-dashed outline-white",
    // The resting card is purple too, tinted: the deck is one hue, and the card
    // that is merely waiting is the quiet version of the one that is answering.
    waiting: "bg-primary/10 ring-1 ring-primary/40",
}

/** The score's own treatment — bright on a win, faded on a loss. */
const SCORE: Record<RailCardState, string> = {
    correct: "text-emerald-600",
    wrong: "text-muted-foreground",
    buzzing: "text-primary-foreground",
    waiting: "text-foreground",
}

/**
 * Which state a card is in. Verdict wins over "buzzing": once the MC has judged,
 * the outcome is what the card should say — the buzz was the moment before.
 */
export function railCardState(input: {
    verdict?: "CORRECT" | "INCORRECT" | null
    /** wrong answer, or locked out of the re-buzz — same grey */
    locked?: boolean
    /** this player's buzz won the current window */
    buzzing?: boolean
}): RailCardState {
    if (input.verdict === "CORRECT") return "correct"
    if (input.verdict === "INCORRECT" || input.locked) return "wrong"
    if (input.buzzing) return "buzzing"
    return "waiting"
}

export function railCardClass(state: RailCardState): string {
    return `transition ${STATE[state]}`
}

export function railScoreClass(state: RailCardState): string {
    return SCORE[state]
}
