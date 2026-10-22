import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"
import type { PlacementTier, SeasonRound, TournamentFormat } from "@/lib/tournaments"

// The role tells the engine which rule the stage's matches must follow.
export type StageRole = "splitting" | "playoff" | "finale"

export const STAGE_ROLES: Array<{ value: StageRole; label: string; hint: string }> = [
    { value: "splitting", label: "Splitting", hint: "one player from each tier, per match" },
    { value: "playoff", label: "Playoff", hint: "the winner climbs, the losers drop" },
    { value: "finale", label: "Finale", hint: "the ladder winners, and the places 1–4" },
]

export interface Stage {
    id: string
    title: string
    role?: StageRole
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