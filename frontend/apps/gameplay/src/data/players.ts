import type { Match } from "@/data/schedule"

export interface Player {
    id: string
    name: string
}

// Single source of truth for player names — rename here, everywhere updates
export const PLAYERS: Player[] = [
    { id: "p1", name: "A. Voss" },
    { id: "p2", name: "M. Tanaka" },
    { id: "p3", name: "K. Ibrahim" },
    { id: "p4", name: "L. Ruiz" },
    { id: "p5", name: "P. Okafor" },
    { id: "p6", name: "S. Novak" },
    { id: "p7", name: "D. Chen" },
    { id: "p8", name: "R. Lindqvist" },
]

const byId = new Map(PLAYERS.map((p) => [p.id, p]))

export function playerName(id: string): string {
    return byId.get(id)?.name ?? id
}

export function hydrateMatches(matches: Match[]): Match[] {
    return matches.map((m) => ({
        ...m,
        players: m.players.map((p) => ({ ...p, name: playerName(p.id) })),
    }))
}