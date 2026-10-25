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
    averageScore: number
    closestRound: RoundRow | null
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

    const byGap = [...roundRows].sort((a, b) => a.gap - b.gap)

    return {
        rounds: roundRows,
        totalPoints,
        topScore,
        averageScore,
        closestRound: byGap[0] ?? null,
        biggestRound: byGap[byGap.length - 1] ?? null,
    }
}
