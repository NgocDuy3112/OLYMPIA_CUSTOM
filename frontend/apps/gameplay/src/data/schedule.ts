export type MatchStatus = "UPCOMING" | "LIVE" | "FINISHED";

export const ROUND_NAMES = [
    "Khởi động",
    "Giải mã",
    "Bứt phá",
    "Về đích",
] as const

export type RoundName = (typeof ROUND_NAMES)[number]

export interface PlayerResult {
    id: string,
    name: string,
    seed?: number,
    score?: number,
    rank?: number,
    roundScores?: Record<RoundName, number>
}

export interface Match {
    id: string,
    date: string,
    startTime: string,
    round: string,
    status: MatchStatus,
    players: PlayerResult[]
}

export interface StandingRow {
    id: string
    rank: number
    name: string
    best: number
    points: number
    prevPoints: number
}

export interface Tournament {
    id: string
    name: string
    subtitle: string
    venue: string
    startDate: string
    endDate: string
}