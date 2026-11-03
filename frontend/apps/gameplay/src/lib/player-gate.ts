// Which GATE a player's transport status puts them behind.
//
// The status codes are ANSWERS, not failures: 401 means the session is gone,
// 403 means this seat is not theirs, 409 means the match is not LIVE yet (the
// live read refuses until it is). Everything else with no view is "loading".
// Pure so the table is unit-tested — getting it wrong shows a player the wrong
// instruction on the projector-sized screen in front of them.
export type PlayerGate =
    /** 401 — the session expired; rejoin with a PIN */
    | "unauthorized"
    /** 403 — the seat belongs to someone else */
    | "not-seated"
    /** 409 — the match has not started; wait in the lobby */
    | "not-live"
    /** no view yet and no answer — the first read has not landed */
    | "loading"

interface GateInput {
    /** the live read's HTTP status, when it answered with one */
    failureStatus: number | undefined
    /** has a view painted? */
    hasView: boolean
}

/** The gate this player is behind, or null (they may see the deck). */
export function gateOf(input: GateInput): PlayerGate | null {
    if (input.failureStatus === 401) return "unauthorized"
    if (input.failureStatus === 403) return "not-seated"
    if (input.failureStatus === 409) return "not-live"
    if (!input.hasView) return "loading"
    return null
}
