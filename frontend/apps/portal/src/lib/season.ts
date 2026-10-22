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

export interface SeasonDetail extends Season {
    roundRules: Record<string, RoundConfig> | null
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
    totalPoints: number
    matchesPlayed: number
    placementPoints: number
    stageId: string | null
    stageTitle: string | null
    slot: number | null
    tieBreak: string | null
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
        mutationFn: (patch: Partial<Pick<SeasonDetail, "roundRules" | "stages">>) =>
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

// ── The roster ────────────────────────────────────────────────────────────────

export function useEnrolled(tournamentId: string, seasonId: string) {
    return useQuery({
        queryKey: ["enrolled", tournamentId, seasonId],
        queryFn: () =>
            api<{ items: Array<{ userId: string; displayName: string }> }>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/players`
            ),
        enabled: Boolean(tournamentId && seasonId),
    })
}

// ── The matches ───────────────────────────────────────────────────────────────

export function useMatches(tournamentId: string, seasonId: string) {
    return useQuery({
        queryKey: ["matches", tournamentId, seasonId],
        queryFn: () =>
            api<{ items: MatchSummary[]; total: number }>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches?limit=100`
            ),
        enabled: Boolean(tournamentId && seasonId),
    })
}

export function useCreateMatch(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            stageId: string
            scheduledAt: string
            playerIds: string[]
        }) =>
            api<MatchSummary>(`/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches`, {
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
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId, seasonId] })
        },
    })
}

// The mass event: the whole roster answers the same question set, once.
export function useCreateQualificationMatch(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            scheduledAt: string
            questionCount: number
            playerIds?: string[]
        }) =>
            api<MatchSummary>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/qualification-matches`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId, seasonId] })
        },
    })
}

export function useSetMatchResults(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { matchId: string; totals: Array<{ userId: string; score: number }> }) =>
            api(`/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${input.matchId}/results`, {
                method: "POST",
                body: JSON.stringify({ totals: input.totals }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId, seasonId] })
            void queryClient.invalidateQueries({ queryKey: ["standings", tournamentId, seasonId] })
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

export function useMassEvent(tournamentId: string, seasonId: string, matchId: string | null) {
    return useQuery({
        queryKey: ["mass-event", tournamentId, seasonId, matchId],
        queryFn: () =>
            api<MassEventView>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/qualification-matches/${matchId}`
            ),
        enabled: Boolean(tournamentId && seasonId && matchId),
    })
}

// Close the mass event. If the field ties, the staff order the tied group and try again.
export function useCloseMassEvent(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            matchId: string
            tieBreaks?: Array<{ players: string[]; order: string[] }>
        }) =>
            api<{ rows: Array<{ userId: string; rank: number; score: number }> }>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/qualification-matches/${input.matchId}/close`,
                {
                    method: "POST",
                    body: JSON.stringify(input.tieBreaks ? { tieBreaks: input.tieBreaks } : {}),
                }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["mass-event", tournamentId, seasonId] })
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId, seasonId] })
        },
    })
}

// ── The standings ─────────────────────────────────────────────────────────────

export function useStandings(tournamentId: string, seasonId: string) {
    return useQuery({
        queryKey: ["standings", tournamentId, seasonId],
        queryFn: () =>
            api<{ rows: StandingRow[] }>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/standings`
            ),
        enabled: Boolean(tournamentId && seasonId),
    })
}

export function useRecomputeStandings(tournamentId: string, seasonId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: () =>
            api<{ rows: StandingRow[] }>(
                `/portal/tournaments/${tournamentId}/seasons/${seasonId}/standings/recompute`,
                { method: "POST" }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["standings", tournamentId, seasonId] })
        },
    })
}
