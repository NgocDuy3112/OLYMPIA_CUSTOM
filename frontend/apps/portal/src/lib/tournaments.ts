import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, type PageResult } from "@shared/lib/api"

// ── The tournament's shape ───────────────────────────────────────────────────────

export interface TournamentRound {
    id: string
    name: string
    order: number
    chart: string
}

// No team knobs: every seat is a user (the contract's SeatSchema says so). An
// AOC group stage is a ROSTER property (`tournament_players.group`), not a format one.
export interface TournamentFormat {
    competitorsPerMatch: number
}

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
    current: boolean
    stages: Stage[]
    rounds: TournamentRound[]
    format: TournamentFormat
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
