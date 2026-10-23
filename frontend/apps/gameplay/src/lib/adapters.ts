// The adapters: the wire shapes (@/lib/api) become the view model (@/lib/types).
//
// Pure — no react, no fetch. Three jobs the wire format deliberately leaves to
// the client:
//
//   1. TIME     scheduledAt is an instant (timestamptz); the schedule shows the
//               show's wall clock, so every viewer sees the same time — a shared
//               artifact, not a personal one. Asia/Ho_Chi_Minh, fixed.
//   2. MERGE    the wire separates `players` (the seats, always) from `results`
//               (the stored totals, FINISHED only); the views want one list —
//               the seats with the result overlaid.
//   3. REKEY    result roundScores come keyed by round id ("khoi-dong"); the
//               charts render round names ("Khởi động") via tournament.rounds.
import type { Match, StandingRow as ApiStandingRow, TournamentRound } from "./api"
import type { Match as ViewMatch, PlayerResult, StandingRow } from "./types"

// The show runs in one timezone: every viewer sees the same wall clock.
const SHOW_TIME_ZONE = "Asia/Ho_Chi_Minh"

// en-CA formats a date as YYYY-MM-DD.
const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHOW_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
})

// h23 renders 00:00–23:59 — never the "24:30" that hour12: false can produce.
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

// A round id becomes its name; an id the tournament does not list stays as it
// came — the chart degrades, it never throws.
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
    // The seats are the truth about who played; the results only decorate them.
    // A result naming someone unseated is server data we simply do not surface.
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
        kind: row.kind,
        date: showDate(row.scheduledAt),
        startTime: showTime(row.scheduledAt),
        round: row.round,
        players,
    }
}

// The places table: the wire's row IS the model's row under different names —
// place is rank, placementPoints is the statistic the panel shows as points.
export function toStandingRow(row: ApiStandingRow): StandingRow {
    return {
        id: row.userId,
        rank: row.place,
        name: row.displayName,
        stageTitle: row.stageTitle,
        matchesPlayed: row.matchesPlayed,
        points: row.placementPoints,
        tieBreak: row.tieBreak,
    }
}

export function toStandings(rows: ApiStandingRow[]): StandingRow[] {
    return rows.map(toStandingRow)
}
