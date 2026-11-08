export type PlayerGate =
    | "unauthorized"
    /** 403 — the seat belongs to someone else */
    | "not-seated"
    /** 409 — the match has not started; wait in the lobby */
    | "not-live"
    /** no view yet and no answer — the first read has not landed */
    | "loading"

interface GateInput {
    failureStatus: number | undefined
    hasView: boolean
}

export function gateOf(input: GateInput): PlayerGate | null {
    if (input.failureStatus === 401) return "unauthorized"
    if (input.failureStatus === 403) return "not-seated"
    if (input.failureStatus === 409) return "not-live"
    if (!input.hasView) return "loading"
    return null
}
