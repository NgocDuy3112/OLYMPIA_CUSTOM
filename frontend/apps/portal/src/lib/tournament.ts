import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import type { Tournament, TournamentRound } from "@/lib/tournaments"

interface TurnConfig {
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

type ScoringRule =
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
        powers: { star: { correct: number; incorrect: number } }
    }

export interface RoundConfig {
    allowedKinds: Array<"CHOICE" | "TEXT" | "KEYWORD" | "HINT">
    scoring: ScoringRule
    turns: TurnConfig[]
}

export interface TournamentDetail extends Tournament {
    roundRules: Record<string, RoundConfig> | null
    places: number
}

export interface MatchSeat {
    kind: "user"
    userId: string
    seed: number
}

export interface MatchSummary {
    id: string
    stageId: string
    slot: number | null
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    scheduledAt: string
    players: MatchSeat[]
    questions: unknown[]
    assemblyRevision?: number
    assembledAt?: string | null
    assemblyEvents?: Array<{
        id: string
        revision: number
        mode: string
        addedCount: number
        removedCount: number
        at: string
    }>
}

interface StandingRow {
    userId: string
    displayName: string
    place: number | null
    matchesPlayed: number
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
        mutationFn: (patch: Partial<Pick<TournamentDetail, "roundRules" | "stages">> & { rounds?: TournamentRound[] }) =>
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


export function useEnrolled(tournamentId: string) {
    return useQuery({
        queryKey: ["enrolled", tournamentId],
        queryFn: () => api<{ items: ContestantRow[] }>(`/portal/tournaments/${tournamentId}/players`),
        enabled: Boolean(tournamentId),
    })
}


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


export interface GroupRow {
    userId: string
    displayName: string
    matchesPlayed: number
    bankedPoints: number
    averages: { phase1: number | null; phase2: number | null; all: number | null }
}

interface GroupTables {
    groups: Array<{ id: "A" | "B"; teamPoints: number; rows: GroupRow[] }>
    unassigned: Array<{ userId: string; displayName: string }>
    wildcard: Array<GroupRow & { avg: number }>
}

export function useGroups(tournamentId: string) {
    return useQuery({
        queryKey: ["groups", tournamentId],
        queryFn: () => api<GroupTables>(`/portal/tournaments/${tournamentId}/groups`),
        enabled: Boolean(tournamentId),
    })
}

export interface ContestantRow {
    userId: string
    displayName: string
    username: string
    email: string | null
    discordId: string | null
    group: "A" | "B" | null
    enrolledAt: string
}

export function useContestants(tournamentId: string) {
    return useQuery({
        queryKey: ["enrolled", tournamentId],
        queryFn: () => api<{ items: ContestantRow[] }>(`/portal/tournaments/${tournamentId}/players`),
        enabled: Boolean(tournamentId),
    })
}

export function useAssignGroup(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (placed: { userId: string; group: "A" | "B" | null }) =>
            api<{ userId: string; group: "A" | "B" | null }>(
                `/portal/tournaments/${tournamentId}/players/${placed.userId}/group`,
                { method: "PATCH", body: JSON.stringify({ group: placed.group }) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
        },
    })
}


export interface RoomCode {
    matchId: string
    code: string
    expiresAt: string
}

export function useMatchCodes(tournamentId: string) {
    return useQuery({
        queryKey: ["match-codes", tournamentId],
        queryFn: () => api<{ items: RoomCode[] }>(`/portal/tournaments/${tournamentId}/match-codes`),
        enabled: Boolean(tournamentId),
        retry: false,
    })
}

export function useRotateMatchCode(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (matchId: string) =>
            api<RoomCode>(`/portal/tournaments/${tournamentId}/matches/${matchId}/code`, {
                method: "POST",
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["match-codes", tournamentId] })
        },
    })
}

export function useEjectSeat(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (seat: { matchId: string; userId: string }) =>
            api<void>(
                `/portal/tournaments/${tournamentId}/matches/${seat.matchId}/players/${seat.userId}`,
                { method: "DELETE" }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["matches", tournamentId] })
        },
    })
}



