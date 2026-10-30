import type { LobbyData } from "@/lib/live"

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
