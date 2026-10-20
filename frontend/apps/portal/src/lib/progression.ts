import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import type { Season } from "@/lib/seasons"

export interface TurnConfig {
    id: string
    mode: "oral" | "text"
    delivery: "sequential" | "batch" | "pick"
    timeBudgetSeconds?: number
    timeLimitSeconds?: number
    buzzWindowSeconds?: number
    pickCount?: number
    questionCount?: number
}

export type ScoringRule =
    | { template: "constant"; points: number }
    | { template: "keyword_derived"; initial: number; dropPerHint: number; incorrect: 0 }
    | {
        template: "rank_multiplier"
        bands: Array<{ untilSec: number; points: number }>
        ladderTop: number
        incorrect: 0
        timeBasis: "first" | "final"
    }
    | {
        template: "outcome_multipliers"
        correct: number
        incorrect: number
        powers: {
            hope: { correct: number; incorrect: number }
            shield: { correct: number; incorrect: number }
        }
    }

export interface RoundConfig {
    allowedKinds: Array<"MC" | "TEXT" | "KEYWORD">
    scoring: ScoringRule
    turns: TurnConfig[]
}

export interface Progression {
    advance: number
    questionCount: number
    groupSize: number
    splittingRounds: number
    finaleSize: number
}

export interface SeasonDetail extends Season {
    progression: Progression | null
    roundRules: Record<string, RoundConfig> | null
    qualificationQuestions: unknown[] | null
}

export function useSeason(tournamentId: string, seasonId: string) {
    return useQuery({
        queryKey: ["season", tournamentId, seasonId],
        queryFn: () =>
            api<SeasonDetail>(`/portal/tournaments/${tournamentId}/seasons/${seasonId}`),
        enabled: Boolean(tournamentId && seasonId),
    })
}

export function useUpdateSeason(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (patch: Partial<Pick<SeasonDetail, "roundRules" | "progression">>) =>
            api<SeasonDetail>(`/portal/tournaments/${tournamentId}/seasons/${seasonId}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            }),
        onSuccess: (season) => {
            queryClient.setQueryData(["season", tournamentId, seasonId], season)
            void queryClient.invalidateQueries({ queryKey: ["seasons", tournamentId] })
        },
    })
}

export interface DrawResult {
    stageId: string
    seed: string
    groups: string[][]
    matchIds: string[]
}

export function useDrawSplitting(tournamentId: string, seasonId: string) {
    return useMutation({
        mutationFn: (input: { round: number; scheduledAt: string; label?: string }) =>
            api<DrawResult>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/splitting/draw`,
                { method: "POST", body: JSON.stringify(input) }
            ),
    })
}

export function useCloseSplitting(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (input: { tieBreaks?: Array<{ players: string[]; order: string[] }> } = {}) =>
            api<{ rows: Array<{ userId: string; rank: number; score: number }> }>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/splitting/close`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["season", tournamentId, seasonId] })
        },
    })
}