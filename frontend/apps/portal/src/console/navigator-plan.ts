import type { LobbyData } from "@/lib/live"

// Rounds that ARE two halves — the lobby shows them as a pair of entries.
// phase 1 → the "· riêng/chung" first label, phase 2 → the second:
//   Khởi động: 1 = oral Riêng, 2 = typed Chung
//   Về đích:   1 = shared Chung, 2 = individual Riêng
const PHASE_PAIRS: Record<string, [string, string]> = {
    "khoi-dong": ["Riêng", "Chung"],
    "ve-dich": ["Chung", "Riêng"],
}

/**
 * The lobby's round list with Khởi động/Về đích split into their two halves —
 * two entries share the round id, `phase` says which side a FRESH start opens
 * (the start payload carries it to the engine's phase-2 skip). Saved rounds
 * resume through round.goTo either way; unknown/custom rounds pass through.
 * Pure — table-tested.
 */
export function expandRoundEntries(rounds: LobbyData["rounds"]): LobbyData["rounds"] {
    return rounds.flatMap((round) => {
        // Already split → pass through untouched (idempotent: prepared data can
        // flow back in — HMR mixes, re-renders — and can never double-split into
        // phantom duplicate buttons).
        if (round.phase !== undefined) return [round]
        const labels = PHASE_PAIRS[round.id]
        if (!labels) return [round]
        return labels.map((label, i) => ({
            ...round,
            name: `${round.name} · ${label}`,
            phase: (i + 1) as 1 | 2,
        }))
    })
}

/**
 * What the rounds navigator sends when the MC clicks a round: a fresh ("new")
 * ACTIVE round starts bare; anything else re-opens via round.goTo, appending a
 * start only for rounds that never ran. Pure — table-tested.
 */
export function navigatorStartPlan(
    lobby: LobbyData,
    roundId: string,
    startPayload: Record<string, unknown>,
): Record<string, unknown>[] {
    const target = lobby.rounds.find((r) => r.id === roundId)
    const isActive = lobby.roundId === roundId

    if (target?.status === "new" && isActive) return [startPayload]

    const chain: Record<string, unknown>[] = [{ kind: "round.goTo", roundId }]
    if (target?.status !== "ended" && target?.status !== "playing") {
        chain.push(startPayload)
    }
    return chain
}
