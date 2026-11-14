export type PlayerGate =
    | "unauthorized"
    | "not-seated"
    | "not-live"
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
