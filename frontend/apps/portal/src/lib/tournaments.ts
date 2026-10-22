import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"

export interface Tournament {
    id: string
    name: string
    slug: string
    visibility: "PUBLIC" | "PRIVATE"
    defaultTags: string[]
    createdAt: string
    updatedAt: string
}

export const TOURNAMENTS_PAGE_SIZE = 20

export interface TournamentFilters {
    search?: string
    limit?: number
    offset?: number
}

export interface SeasonRound {
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

// The scales a tournament can be set up with. A preset is a starting point, not a
// default: the points for places are the tournament's own.
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

export interface TournamentDetail extends Tournament {
    ownerId: string
    defaultRounds: SeasonRound[]
    defaultFormat: TournamentFormat
    defaultPlacementTiers: PlacementTier[]
}

export interface TournamentUpdate {
    name?: string
    slug?: string
    visibility?: "PUBLIC" | "PRIVATE"
    defaultTags?: string[]
    defaultPlacementTiers?: PlacementTier[]
}

export function useTournament(id: string) {
    return useQuery({
        queryKey: ["tournament", id],
        queryFn: () => api<TournamentDetail>(`/portal/tournaments/${id}`),
        enabled: id.length > 0,
    })
}

export function useTournaments({
    search,
    limit = TOURNAMENTS_PAGE_SIZE,
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

        placeholderData: keepPreviousData,
    })
}


export function useUpdateTournament(id: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (patch: TournamentUpdate) =>
            api<TournamentDetail>(`/portal/tournaments/${id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            }),

        onSuccess: (updated) => {
            queryClient.setQueryData(["tournament", id], updated)
            void queryClient.invalidateQueries({ queryKey: ["tournaments"] })
        },
    })
}