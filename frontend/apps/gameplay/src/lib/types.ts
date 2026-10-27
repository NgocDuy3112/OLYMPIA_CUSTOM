// The app's view model — what the pages and components render.
//
// The wire shapes (@/lib/api) become these through the pure adapters in
// @/lib/adapters. The shapes are the mock shapes where the model still holds,
// and the places model where it does not (StandingRow).

export type MatchStatus = "UPCOMING" | "LIVE" | "FINISHED"

// A seated player, with their result overlaid once the match is FINISHED.
export interface PlayerResult {
    id: string
    name: string
    seed: number
    score?: number
    rank?: number
    // Keyed by ROUND NAME ("Khởi động"), rekeyed from the API's round ids.
    roundScores?: Record<string, number>
}

export interface Match {
    id: string
    stageId: string
    slot: number | null
    status: MatchStatus
    // "YYYY-MM-DD" and "HH:mm", in the show's timezone — see adapters.ts.
    date: string
    startTime: string
    // "<stage title> · <label>", composed by the server.
    round: string
    players: PlayerResult[]
}

// A row of the places table: how far the player got, never a sum of scores.
// `points` is the statistic (what the place was worth), never the ranking key.
export interface StandingRow {
    id: string
    rank: number | null
    name: string
    // The last stage the player reached — null for a player who never played.
    stageTitle: string | null
    matchesPlayed: number
    points: number
}
