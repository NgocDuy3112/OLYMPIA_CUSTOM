// Is the deck or the waiting room? — the console's ONE readiness decision.
//
// Two named booleans, no six-term guard: `ready` answers "may a round screen
// draw at all", `waiting` answers "must the lobby be asked for". They are pure
// so the truth table can be tested without mounting the transport — the gate is
// the console's behavior, and a wrong row here shows a dead deck.
import { isKnownRound, isWaitingStage } from "@shared/deck/geometry"

export interface ReadinessInput {
    /** the operator navigated into the round (the lobby's round buttons) */
    entered: boolean
    /** Về sảnh was pressed — overrides the stage until a start clears it */
    atWaiting: boolean
    /** the rounds navigator is open */
    roundsView: boolean
    roundId: string
    stage: string
    /** the first GET/push has painted */
    viewPainted: boolean
    /** the live read failed */
    transportRefused: boolean
}

interface Readiness {
    /** a round screen may draw (known round, not waiting, not navigated away) */
    roundScreenReady: boolean
    /** the lobby must be asked for — it answers both "not live" and "between rounds" */
    waiting: boolean
}

/**
 * The deck's readiness.
 *
 * An ended/unknown/pending stage is the WAITING ROOM (the same rule the player
 * surface has), so exiting a round lands both sides on the lobby, never a dead
 * screen. `entered` still wins: a saved ENDED state re-opened for review draws
 * the deck (automatic ends clear it). `atWaiting` outranks both — Về sảnh means
 * the deck stops drawing whatever the round's own end plan does.
 */
export function readinessOf(input: ReadinessInput): Readiness {
    const roundScreenReady =
        !input.atWaiting &&
        (input.entered || !isWaitingStage(input.stage)) &&
        isKnownRound(input.roundId) &&
        !input.roundsView
    const waiting = input.transportRefused || !input.viewPainted || !roundScreenReady
    return { roundScreenReady, waiting }
}
