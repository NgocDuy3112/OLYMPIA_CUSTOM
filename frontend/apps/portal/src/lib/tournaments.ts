import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"

// ── The tournament's shape ───────────────────────────────────────────────────────

export interface TournamentRound {
    id: string
    name: string
    order: number
    chart: string
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

// The scales a tournament can be set up with. A preset is a starting point, not a default:
// the points for places are the tournament's own.
export const PLACEMENT_SCALES = [
    {
        id: "olympia",
        title: "Olympia",
        description: "16 places, a finale of 4",
        tiers: [
            { min: 1, max: 1, points: 25 },
            { min: 2, max: 2, points: 18 },
            { min: 3, max: 3, points: 12 },
            { min: 4, max: 4, points: 8 },
            { min: 5, max: 7, points: 5 },
            { min: 8, max: 10, points: 3 },
            { min: 11, max: 13, points: 2 },
            { min: 14, max: 16, points: 1 }
        ]
    }
] as const

// ── The tournament ────────────────────────────────────────────────────────────────

// What a stage is for. The role tells the engine which rule the stage's matches must
// follow, so the staff can place the matches by hand and still be checked against the
// format.
export type StageRole = "splitting" | "playoff" | "finale"

export const STAGE_ROLES: Array<{ value: StageRole; label: string; hint: string }> = [
    { value: "splitting", label: "Splitting", hint: "one player from each tier, per match" },
    { value: "playoff", label: "Playoff", hint: "the winner climbs, the losers drop" },
    { value: "finale", label: "Finale", hint: "the ladder winners, and the places 1–4" }
]

export interface Stage {
    id: string
    title: string
    role?: StageRole
    start?: string
    end?: string
}

export interface Tournament {
    id: string
    name: string
    slug: string
    visibility: "PUBLIC" | "PRIVATE"
    ownerId: string
    // The tags decide which questions of the global bank this tournament may assemble.
    tags: string[]
    current: boolean
    stages: Stage[]
    rounds: TournamentRound[]
    format: TournamentFormat
    placementTiers: PlacementTier[]
    closedAt: string | null
    createdAt: string
    updatedAt: string
}

export const SEASONS_PAGE_SIZE = 20

export interface TournamentFilters {
    search?: string
    limit?: number
    offset?: number
}

export function useTournaments({
    search,
    limit = SEASONS_PAGE_SIZE,
    offset = 0,
}: TournamentFilters = {}) {
    return useQuery({
        queryKey: ["tournaments", { search: search ?? "", limit, offset }],
        queryFn: () => {
            const params = new URLSearchParams({
                limit: String(limit),
                offset: String(offset),
            })
            if (search) params.set("search", search)

            return api<PageResult<Tournament>>(`/portal/tournaments?${params.toString()}`)
        },
    })
}

export interface TournamentCreate {
    name: string
    tags?: string[]
    visibility?: "PUBLIC" | "PRIVATE"
    current?: boolean
}

export function useCreateTournament() {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: TournamentCreate) =>
            api<Tournament>(`/portal/tournaments`, {
                method: "POST",
                body: JSON.stringify(input),
            }),

        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["tournaments"] })
        },
    })
}
