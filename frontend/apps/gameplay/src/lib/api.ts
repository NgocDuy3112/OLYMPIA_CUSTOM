import { useQuery } from "@tanstack/react-query"
import { api } from "@shared/lib/api"


export interface ScaleCoverage {
    places: number
    covered: number
    missing: number[]
    beyond: number[]
}

export interface TournamentRound {
    id: string
    name: string
    order: number
    chart: string
}

export interface Stage {
    id: string
    title: string
    role?: "splitting" | "playoff" | "finale"
    start?: string
    end?: string
}

export interface TournamentFormat {
    competitorsPerMatch: number
    allowedSeatKinds: Array<"user" | "team">
    teamSize: number | null
    teamAggregation: "sum" | "best" | "avg" | null
    teamCountAggregation: "sum" | "none" | null
}

export interface PlacementTier {
    min: number
    max: number
    points: number
}

// The list route: enough to pick a tournament.
export interface TournamentSummary {
    id: string
    slug: string
    name: string
    current: boolean
    createdAt: string
    start: string | null
    end: string | null
}

// One tournament: identity, the stage list, the points scale, the places.
export interface TournamentDetail extends TournamentSummary {
    closedAt: string | null
    rounds: TournamentRound[]
    format: TournamentFormat
    stages: Stage[]
    placementTiers: PlacementTier[]
    places: number
    points: ScaleCoverage
}

export interface MatchPlayer {
    id: string
    name: string
    seed: number
}

// A final result of a FINISHED match — only such matches carry `results`.
export interface MatchResult {
    id: string
    name: string
    totalScore: number
    rank: number
    // Keyed by round id ("khoi-dong"); the adapters rekey it to names.
    roundScores: Record<string, number>
}

export interface Match {
    id: string
    stageId: string
    slot: number | null
    status: "UPCOMING" | "LIVE" | "FINISHED"
    scheduledAt: string
    // "<stage title> · <label>", composed by the server.
    round: string
    players: MatchPlayer[]
    results?: MatchResult[]
}

// A row of the places table: how far the player got, never a sum of scores.
export interface StandingRow {
    userId: string
    displayName: string
    place: number | null
    matchesPlayed: number
    placementPoints: number
    stageId: string | null
    stageTitle: string | null
    slot: number | null
}

export interface Page<T> {
    items: T[]
    total: number
    limit: number
    offset: number
}


export const SCHEDULE_LIMIT = "100"

export function useTournamentList() {
    return useQuery({
        queryKey: ["gameplay", "tournaments"],
        queryFn: () =>
            api<{ tournaments: TournamentSummary[] }>("/gameplay/tournaments"),
    })
}

export function useTournament(slug: string) {
    return useQuery({
        queryKey: ["gameplay", "tournament", slug],
        queryFn: () => api<TournamentDetail>(`/gameplay/tournaments/${slug}`),
        enabled: Boolean(slug),
    })
}

export function useSchedule(slug: string) {
    return useQuery({
        queryKey: ["gameplay", "schedule", slug],
        queryFn: () =>
            api<Page<Match>>(
                `/gameplay/tournaments/${slug}/matches?limit=${SCHEDULE_LIMIT}`
            ),
        enabled: Boolean(slug),
    })
}

export function useStandings(slug: string) {
    return useQuery({
        queryKey: ["gameplay", "standings", slug],
        queryFn: () =>
            api<{ rows: StandingRow[] }>(`/gameplay/tournaments/${slug}/standings`),
        enabled: Boolean(slug),
    })
}
