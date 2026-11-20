import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"


export interface TournamentRound {
    id: string
    name: string
    order: number
    chart: string
}

export interface TournamentFormat {
    competitorsPerMatch: number
    allowedCompetitorCounts?: number[]
}

export function allowedSeatsOf(format: TournamentFormat): number[] {
    const counts = format.allowedCompetitorCounts ?? []
    if (counts.length > 0) return counts
    return [format.competitorsPerMatch]
}

export function seatsPhrase(counts: number[]): string {
    if (counts.length <= 1) return String(counts[0] ?? 0)
    return `${counts.slice(0, -1).join(", ")} or ${counts.at(-1)}`
}


export interface Stage {
    id: string
    title: string
    start?: string
    end?: string
}

export interface Tournament {
    id: string
    name: string
    slug: string
    visibility: "PUBLIC" | "PRIVATE"
    ownerId: string
    current: boolean
    stages: Stage[]
    rounds: TournamentRound[]
    format: TournamentFormat
    closedAt: string | null
    createdAt: string
    updatedAt: string
}

export const SEASONS_PAGE_SIZE = 20

interface TournamentFilters {
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

interface TournamentCreate {
    name: string
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
