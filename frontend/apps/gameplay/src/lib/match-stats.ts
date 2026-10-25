// The Thống kê tab's data — derived, never fetched: every number here comes from
// the results the app already carries (totals, per-round scores, seeds). Pure and
// unit-tested; the component only renders.
//
// The stats TABLE is deliberately not exposed by the read surface — this module
// never needs it: a round's points per player say everything the tab shows.

import type { TournamentRound } from "@/lib/api"
import type { Match, PlayerResult } from "@/lib/types"

export interface RoundRow {
    /** The round's display name, in the tournament's order. */
    round: string
    /** Points this round, per player — 0 when the player sat it out. */
    scores: Array<{ playerId: string; name: string; points: number }>
    /** Top scorer(s) of this round — a tie shares the win. */
    winnerIds: string[]
    /** top − bottom across the players who carry round scores. */
    gap: number
}

export interface MatchStatistics {
    /** Rounds in tournament order, kept only when someone scored in them. */
    rounds: RoundRow[]
    totalPoints: number
    topScore: number
    /** Mean of the players' totals (0 when nobody has a score yet). */
    averageScore: number
    /** #1 − #2 in the final totals; null for fewer than two scored players. */
    margin: number | null
    /** Most round wins: who, and how many of the played rounds. */
    roundWins: { names: string[]; count: number } | null
    /** The tightest round (smallest gap ≥ 0 among played rounds). */
    closestRound: RoundRow | null
    /** The round that split the field the most. */
    biggestRound: RoundRow | null
}

const played = (players: PlayerResult[], round: string): boolean =>
    players.some((p) => p.roundScores !== undefined && round in p.roundScores)

const pointsOf = (player: PlayerResult, round: string): number =>
    player.roundScores?.[round] ?? 0

export function statisticsFor(match: Match, rounds: TournamentRound[]): MatchStatistics {
    const players = match.players
    const names = rounds.map((r) => r.name)

    const roundRows: RoundRow[] = names
        .filter((round) => played(players, round))
        .map((round) => {
            const scores = players.map((p) => ({
                playerId: p.id,
                name: p.name,
                points: pointsOf(p, round),
            }))
            const values = scores.map((s) => s.points)
            const top = Math.max(...values)
            return {
                round,
                scores,
                winnerIds: scores.filter((s) => s.points === top && top > 0).map((s) => s.playerId),
                gap: top - Math.min(...values),
            }
        })

    const totals = players.map((p) => ({ name: p.name, score: p.score ?? 0 }))
    const sorted = [...totals].sort((a, b) => b.score - a.score)
    const topScore = sorted[0]?.score ?? 0
    const totalPoints = totals.reduce((sum, p) => sum + p.score, 0)
    const averageScore = players.length > 0 ? totalPoints / players.length : 0
    const margin = sorted.length >= 2 && match.status !== "UPCOMING"
        ? sorted[0].score - sorted[1].score
        : null

    // Round wins across the played rounds (a tied round counts for each winner).
    let roundWins: MatchStatistics["roundWins"] = null
    if (roundRows.length > 0) {
        const counts = new Map<string, { name: string; count: number }>()
        for (const row of roundRows) {
            for (const id of row.winnerIds) {
                const player = players.find((p) => p.id === id)
                if (!player) continue
                const entry = counts.get(id) ?? { name: player.name, count: 0 }
                entry.count += 1
                counts.set(id, entry)
            }
        }
        const best = Math.max(0, ...[...counts.values()].map((c) => c.count))
        const namesOfBest = [...counts.values()].filter((c) => c.count === best).map((c) => c.name)
        roundWins = best > 0 ? { names: namesOfBest, count: best } : null
    }

    const byGap = [...roundRows].sort((a, b) => a.gap - b.gap)

    return {
        rounds: roundRows,
        totalPoints,
        topScore,
        averageScore,
        margin,
        roundWins,
        closestRound: byGap[0] ?? null,
        biggestRound: byGap[byGap.length - 1] ?? null,
    }
}
