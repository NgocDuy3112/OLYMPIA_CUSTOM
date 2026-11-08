import type { LobbyData } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"

const PHASE_PAIRS: Record<string, [string, string]> = {
    "khoi-dong": ["Riêng", "Chung"],
    "ve-dich": ["Chung", "Riêng"],
}

export function expandRoundEntries(rounds: LobbyData["rounds"]): LobbyData["rounds"] {
    return rounds.flatMap((round) => {
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

export function navigatorStartPlan(
    lobby: LobbyData,
    roundId: string,
    start: LiveAction | null,
): LiveAction[] {
    const target = lobby.rounds.find((r) => r.id === roundId)
    const isActive = lobby.roundId === roundId

    if (target?.status === "new" && isActive) return start ? [start] : []

    const chain: LiveAction[] = [{ kind: "round.goTo", roundId }]
    if (start && target?.status !== "ended" && target?.status !== "playing") {
        chain.push(start)
    }
    return chain
}
