import type { Match, StandingRow } from "@/data/schedule"
import { playerName } from "@/data/players"


interface Accumulator {
    points: number
    best: number
}


export function computeStandings(
    matches: Match[],
    prevPointsById: Map<string, number> = new Map()
): StandingRow[] {
    const acc = new Map<string, Accumulator>()

    for (const match of matches) {
        for (const p of match.players) {
            if (!acc.has(p.id)) acc.set(p.id, { points: 0, best: Infinity })
        }
        if (match.status !== "FINISHED") continue
        for (const p of match.players) {
            const a = acc.get(p.id)!
            a.points += p.score ?? 0
            if (p.rank !== undefined) a.best = Math.min(a.best, p.rank)
        }
    }

    const rows: StandingRow[] = [...acc.entries()].map(([id, a]) => ({
        id,
        rank: 0,
        name: playerName(id),
        best: Number.isFinite(a.best) ? a.best : 0,
        points: a.points,
        prevPoints: prevPointsById.get(id) ?? 0,
    }))

    rows.sort(
        (a, b) =>
            b.points - a.points ||
            (a.best || 99) - (b.best || 99) ||
            a.name.localeCompare(b.name)
    )
    rows.forEach((row, i) => {
        row.rank = i + 1
    })
    return rows
}

export function scoreTotals(matches: Match[]): Map<string, number> {
    return new Map(computeStandings(matches).map((r) => [r.id, r.points]))
}