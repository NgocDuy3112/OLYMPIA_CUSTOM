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
        powers: {
            hope: { correct: number; incorrect: number }
            shield: { correct: number; incorrect: number }
        }
    }

export interface RoundConfig {
    allowedKinds: Array<"MC" | "TEXT" | "KEYWORD" | "HINT">
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

export interface MatchSeat {
    kind: "user" | "team"
    userId?: string
    teamId?: string
    seed: number
}

export interface MatchSummary {
    id: string
    stageId: string
    slot: number | null
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    scheduledAt: string
    /** The player's door-in code (STANDARD only) — staff display; players enter it on the gameplay app's /join. */
    joinCode?: string | null
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

export interface AssemblyEntry {
    roundId: string
    turnId: string
    sourceId: string
    position?: number
}

export function useCreateMatch(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: {
            label: string
            stageId: string
            scheduledAt: string
            playerIds: string[]
            questions?: AssemblyEntry[]
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
                    questions: input.questions,
                }),
            }),
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

// A standard match's status transition (UPCOMING → LIVE; results do the finish).
export function useTransitionMatch(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { matchId: string; status: "UPCOMING" | "LIVE" | "FINISHED" }) =>
            api<{ id: string; status: string }>(
                `/portal/tournaments/${tournamentId}/matches/${input.matchId}/status`,
                { method: "PATCH", body: JSON.stringify({ status: input.status }) }
            ),
        onSuccess: () => {
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

// ── The questions ────────────────────────────────────────────────────────────

export interface BankQuestion {
    id: string
    kind: "MC" | "TEXT" | "KEYWORD" | "HINT"
    questionText: string
    status: string
}

// The bank's published TEXT questions — what the turn's question may be.
export function useQuestionSearch(search: string, enabled: boolean) {
    return useQuery({
        queryKey: ["bank-questions", search],
        queryFn: () =>
            api<{ items: BankQuestion[]; total: number }>(
                `/portal/questions?status=PUBLISHED&kind=TEXT&limit=20&search=${encodeURIComponent(search)}`
            ),
        enabled,
        staleTime: 30_000,
    })
}
