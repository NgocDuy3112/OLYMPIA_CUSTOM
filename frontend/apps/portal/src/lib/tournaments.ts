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