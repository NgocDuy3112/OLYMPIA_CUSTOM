import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"
import type { PlacementTier, SeasonRound, TournamentFormat } from "@/lib/tournaments"

export interface Stage {
    id: string
    title: string
    start?: string
    end?: string
}

export interface Season {
    id: string
    tournamentId: string
    name: string
    current: boolean
    stages: Stage[]
    rounds: SeasonRound[]
    format: TournamentFormat
    placementTiers: PlacementTier[]
    closedAt: string | null
    createdAt: string
    updatedAt: string
}

export function useSeasons(tournamentId: string) {
    return useQuery({
        queryKey: ["seasons", tournamentId],
        queryFn: () =>
            api<PageResult<Season>>(
                `/portal/tournaments/${tournamentId}/seasons?limit=100`
            ),
        enabled: tournamentId.length > 0,
    })
}

export interface SeasonCreate {
    name: string
    stages: Stage[]
    current?: boolean
}

export function useCreateSeason(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: SeasonCreate) =>
            api<Season>(`/portal/tournaments/${tournamentId}/seasons`, {
                method: "POST",
                body: JSON.stringify(input),
            }),

        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["seasons", tournamentId] })
        },
    })
}