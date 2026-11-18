import type { Match, StandingRow as ApiStandingRow, TournamentRound } from "./api"
import type { Match as ViewMatch, PlayerResult, StandingRow } from "./types"

const SHOW_TIME_ZONE = "Asia/Ho_Chi_Minh"

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
})

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: SHOW_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
})

export function showDate(iso: string): string {
    return dateFormatter.format(new Date(iso))
}

export function showTime(iso: string): string {
    return timeFormatter.format(new Date(iso))
}

export function roundNameOf(rounds: TournamentRound[], roundId: string): string {
    return rounds.find((round) => round.id === roundId)?.name ?? roundId
}

function rekeyRoundScores(
    roundScores: Record<string, number>,
    rounds: TournamentRound[]
): Record<string, number> {
    return Object.fromEntries(
        Object.entries(roundScores).map(([roundId, points]) => [
            roundNameOf(rounds, roundId),
            points,
        ])
    )
}

export function toMatch(row: Match, rounds: TournamentRound[]): ViewMatch {
    const results = new Map((row.results ?? []).map((result) => [result.id, result]))

    const players: PlayerResult[] = row.players.map((seat) => {
        const result = results.get(seat.id)
        return {
            id: seat.id,
            name: seat.name,
            seed: seat.seed,
            ...(result && {
                score: result.totalScore,
                rank: result.rank,
                roundScores: rekeyRoundScores(result.roundScores, rounds),
            }),
        }
    })

    return {
        id: row.id,
        stageId: row.stageId,
        slot: row.slot,
        status: row.status,
        date: showDate(row.scheduledAt),
        startTime: showTime(row.scheduledAt),
        round: row.round,
        players,
    }
}

function toStandingRow(row: ApiStandingRow): StandingRow {
    return {
        id: row.userId,
        rank: row.place,
        name: row.displayName,
        stageTitle: row.stageTitle,
        matchesPlayed: row.matchesPlayed,
    }
}

export function toStandings(rows: ApiStandingRow[]): StandingRow[] {
    return rows.map(toStandingRow)
}
