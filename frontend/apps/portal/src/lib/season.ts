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

export interface ScaleCoverage {
    places: number
    covered: number
    missing: number[]
    beyond: number[]
}

export interface SeasonDetail extends Season {
    roundRules: Record<string, RoundConfig> | null
    places: number
    points: ScaleCoverage
}

export type MatchKind = "STANDARD" | "QUALIFICATION"

export interface MatchSeat {
    kind: "user" | "team"
    userId?: string
    teamId?: string
    seed: number
}

export interface MatchSummary {
    id: string
    kind: MatchKind
    stageId: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    scheduledAt: string
    players: MatchSeat[]
    questions: unknown[]
}

// A row of the season's standings. The place is how far the player got, not a sum of
// points; the points are a statistic.
export interface StandingRow {
    userId: string
    displayName: string
    place: number | null
    matchesPlayed: number
    placementPoints: number
    stageId: string | null
    stageTitle: string | null
    slot: number | null
    tieBreak: string | null
}


export function useSeason(seasonId: string) {
    return useQuery({
        queryKey: ["season", seasonId],
        queryFn: () =>
            api<SeasonDetail>(`/portal/seasons/${seasonId}`),
        enabled: Boolean(seasonId),
    })
}

export function useUpdateSeason(seasonId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (patch: Partial<Pick<SeasonDetail, "roundRules" | "stages" | "placementTiers">>) =>
            api<SeasonDetail>(`/portal/seasons/${seasonId}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            }),
        onSuccess: (season) => {
            queryClient.setQueryData(["season", seasonId], season)
            void queryClient.invalidateQueries({ queryKey: ["seasons"] })
        },
    })
}

// ── The roster ────────────────────────────────────────────────────────────────

export function useEnrolled(seasonId: string) {
    return useQuery({
        queryKey: ["enrolled", seasonId],
        queryFn: () =>
            api<{ items: Array<{ userId: string; displayName: string }> }>(
                `/portal/seasons/${seasonId}/players`
            ),
        enabled: Boolean(seasonId),
    })
}

// ── The matches ───────────────────────────────────────────────────────────────

export function useMatches(seasonId: string) {
    return useQuery({
        queryKey: ["matches", seasonId],
        queryFn: () =>
            api<{ items: MatchSummary[]; total: number }>(
                `/portal/seasons/${seasonId}/matches?limit=100`
            ),
        enabled: Boolean(seasonId),
    })
}

export function useCreateMatch(seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            stageId: string
            scheduledAt: string
            playerIds: string[]
        }) =>
            api<MatchSummary>(`/portal/seasons/${seasonId}/matches`, {
                method: "POST",
                body: JSON.stringify({
                    kind: "STANDARD",
                    stageId: input.stageId,
                    label: input.label,
                    scheduledAt: input.scheduledAt,
                    players: input.playerIds.map((userId, seat) => ({
                        kind: "user",
                        userId,
                        seed: seat + 1,
                    })),
                }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", seasonId] })
        },
    })
}

// The mass event: the whole roster answers the same question set, once.
export function useCreateQualificationMatch(seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            scheduledAt: string
            questionCount: number
            playerIds?: string[]
        }) =>
            api<MatchSummary>(
                `/portal/seasons/${seasonId}/qualification-matches`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", seasonId] })
        },
    })
}

export function useSetMatchResults(seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { matchId: string; totals: Array<{ userId: string; score: number }> }) =>
            api(`/portal/seasons/${seasonId}/matches/${input.matchId}/results`, {
                method: "POST",
                body: JSON.stringify({ totals: input.totals }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", seasonId] })
            void queryClient.invalidateQueries({ queryKey: ["standings", seasonId] })
        },
    })
}

// ── The mass event ────────────────────────────────────────────────────────────

export interface MassEventFieldRow {
    userId: string
    displayName: string
    answered: number
}

export interface MassEventView {
    closed: boolean
    label: string
    questionCount: number
    field: MassEventFieldRow[]
    results: Array<{
        kind: string
        userId?: string
        totalScore: number
        rank: number
    }>
}

export function useMassEvent(seasonId: string, matchId: string | null) {
    return useQuery({
        queryKey: ["mass-event", seasonId, matchId],
        queryFn: () =>
            api<MassEventView>(
                `/portal/seasons/${seasonId}/qualification-matches/${matchId}`
            ),
        enabled: Boolean(seasonId && matchId),
    })
}

// Close the mass event. If the field ties, the staff order the tied group and try again.
export function useCloseMassEvent(seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            matchId: string
            tieBreaks?: Array<{ players: string[]; order: string[] }>
        }) =>
            api<{ rows: Array<{ userId: string; rank: number; score: number }> }>(
                `/portal/seasons/${seasonId}/qualification-matches/${input.matchId}/close`,
                {
                    method: "POST",
                    body: JSON.stringify(input.tieBreaks ? { tieBreaks: input.tieBreaks } : {}),
                }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["mass-event", seasonId] })
            void queryClient.invalidateQueries({ queryKey: ["matches", seasonId] })
        },
    })
}

// ── The standings ─────────────────────────────────────────────────────────────

export function useStandings(seasonId: string) {
    return useQuery({
        queryKey: ["standings", seasonId],
        queryFn: () =>
            api<{ rows: StandingRow[] }>(
                `/portal/seasons/${seasonId}/standings`
            ),
        enabled: Boolean(seasonId),
    })
}

export function useRecomputeStandings(seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: () =>
            api<{ rows: StandingRow[] }>(
                `/portal/seasons/${seasonId}/standings/recompute`,
                { method: "POST" }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["standings", seasonId] })
        },
    })
}
