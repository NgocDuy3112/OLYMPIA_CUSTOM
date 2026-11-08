export type MatchStatus = "UPCOMING" | "LIVE" | "FINISHED"

export interface PlayerResult {
    id: string
    name: string
    seed: number
    score?: number
    rank?: number
    roundScores?: Record<string, number>
}

export interface Match {
    id: string
    stageId: string
    slot: number | null
    status: MatchStatus
    date: string
    startTime: string
    round: string
    players: PlayerResult[]
}

export interface StandingRow {
    id: string
    rank: number | null
    name: string
    stageTitle: string | null
    matchesPlayed: number
}
