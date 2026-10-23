import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import type { Tournament } from "@/lib/tournaments"

export interface TurnConfig {
    id: string
    mode: "oral" | "text"
    delivery: "sequential" | "batch" | "pick"
    timeBudgetSeconds?: number
    timeLimitSeconds?: number
    buzzWindowSeconds?: number
    pickCount?: number
    hintCount?: number
    questionCount?: number
}

export type ScoringRule =
    | { template: "constant"; points: number }
    | {
        template: "keyword_derived"
        initial: number
        dropPerHint: number
        floor?: number
        incorrect: 0
    }
    | {
        template: "rank_multiplier"
        bands: Array<{ untilSec: number; points: number }>
        multipliers?: number[]
        ladderTop: number
        incorrect: 0
        timeBasis: "first" | "final"
    }
    | {
        template: "outcome_multipliers"
        correct: number
        incorrect: number
        faceValues?: Record<string, number>
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

export interface TournamentDetail extends Tournament {
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

// A row of the tournament's standings. The place is how far the player got, not a sum of
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


export function useTournament(tournamentId: string) {
    return useQuery({
        queryKey: ["tournament", tournamentId],
        queryFn: () =>
            api<TournamentDetail>(`/portal/tournaments/${tournamentId}`),
        enabled: Boolean(tournamentId),
    })
}

export function useUpdateTournament(tournamentId: string) {
    const queryClient = useQueryClient()
    return useMutation({
        mutationFn: (patch: Partial<Pick<TournamentDetail, "roundRules" | "stages" | "placementTiers">>) =>
            api<TournamentDetail>(`/portal/tournaments/${tournamentId}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            }),
        onSuccess: (tournament) => {
            queryClient.setQueryData(["tournament", tournamentId], tournament)
            void queryClient.invalidateQueries({ queryKey: ["tournaments"] })
        },
    })
}

// ── The roster ────────────────────────────────────────────────────────────────

export function useEnrolled(tournamentId: string) {
    return useQuery({
        queryKey: ["enrolled", tournamentId],
        queryFn: () =>
            api<{ items: Array<{ userId: string; displayName: string }> }>(
                `/portal/tournaments/${tournamentId}/players`
            ),
        enabled: Boolean(tournamentId),
    })
}

// ── The matches ───────────────────────────────────────────────────────────────

export function useMatches(tournamentId: string) {
    return useQuery({
        queryKey: ["matches", tournamentId],
        queryFn: () =>
            api<{ items: MatchSummary[]; total: number }>(
                `/portal/tournaments/${tournamentId}/matches?limit=100`
            ),
        enabled: Boolean(tournamentId),
    })
}

export function useCreateMatch(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            stageId: string
            scheduledAt: string
            playerIds: string[]
        }) =>
            api<MatchSummary>(`/portal/tournaments/${tournamentId}/matches`, {
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
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
        },
    })
}

// The mass event: the whole roster answers the same question set, once.
export function useCreateQualificationMatch(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            scheduledAt: string
            questionCount: number
            playerIds?: string[]
        }) =>
            api<MatchSummary>(
                `/portal/tournaments/${tournamentId}/qualification-matches`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
        },
    })
}

export function useSetMatchResults(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { matchId: string; totals: Array<{ userId: string; score: number }> }) =>
            api(`/portal/tournaments/${tournamentId}/matches/${input.matchId}/results`, {
                method: "POST",
                body: JSON.stringify({ totals: input.totals }),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["standings", tournamentId] })
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
    // The turns (docs/mass-event.md): null = not opened yet; releasedAt is the
    // server's release of the current question — the clock anchor for the field.
    opened: boolean
    currentPosition: number | null
    releasedAt: string | null
    currentAnswered: number
    field: MassEventFieldRow[]
    results: Array<{
        kind: string
        userId?: string
        totalScore: number
        rank: number
    }>
}

export function useMassEvent(tournamentId: string, matchId: string | null) {
    return useQuery({
        queryKey: ["mass-event", tournamentId, matchId],
        queryFn: () =>
            api<MassEventView>(
                `/portal/tournaments/${tournamentId}/qualification-matches/${matchId}`
            ),
        enabled: Boolean(tournamentId && matchId),
        // The live count is the staff's cue for when to advance. Poll only while
        // the event is actually running — the players' side never polls (it is
        // pushed; see the gameplay app's qualification stream).
        refetchInterval: (query) => {
            const view = query.state.data as MassEventView | undefined
            if (!view || view.closed || !view.opened) return false
            return 3000
        },
    })
}

// Open the event: releases question 1. The route answers with the fresh staff view,
// so the dialog's count starts from the same instant the players' sockets ping.
export function useOpenMassEvent(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (matchId: string) =>
            api<MassEventView>(
                `/portal/tournaments/${tournamentId}/qualification-matches/${matchId}/open`,
                { method: "POST" }
            ),
        onSuccess: (view, matchId) => {
            queryClient.setQueryData(["mass-event", tournamentId, matchId], view)
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
        },
    })
}

// Advance to the next question. Same fresh-view contract as open.
export function useAdvanceMassEvent(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (matchId: string) =>
            api<MassEventView>(
                `/portal/tournaments/${tournamentId}/qualification-matches/${matchId}/advance`,
                { method: "POST" }
            ),
        onSuccess: (view, matchId) => {
            queryClient.setQueryData(["mass-event", tournamentId, matchId], view)
        },
    })
}

// Close the mass event. If the field ties, the staff order the tied group and try again.
export function useCloseMassEvent(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            matchId: string
            tieBreaks?: Array<{ players: string[]; order: string[] }>
        }) =>
            api<{ rows: Array<{ userId: string; rank: number; score: number }> }>(
                `/portal/tournaments/${tournamentId}/qualification-matches/${input.matchId}/close`,
                {
                    method: "POST",
                    body: JSON.stringify(input.tieBreaks ? { tieBreaks: input.tieBreaks } : {}),
                }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["mass-event", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
        },
    })
}

// ── The standings ─────────────────────────────────────────────────────────────

export function useStandings(tournamentId: string) {
    return useQuery({
        queryKey: ["standings", tournamentId],
        queryFn: () =>
            api<{ rows: StandingRow[] }>(
                `/portal/tournaments/${tournamentId}/standings`
            ),
        enabled: Boolean(tournamentId),
    })
}

export function useRecomputeStandings(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: () =>
            api<{ rows: StandingRow[] }>(
                `/portal/tournaments/${tournamentId}/standings/recompute`,
                { method: "POST" }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["standings", tournamentId] })
        },
    })
}
