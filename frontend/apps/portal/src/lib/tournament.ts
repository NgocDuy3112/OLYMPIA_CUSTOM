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
        // STAR is the only configurable multiplier (HOPE, renamed). ASSIGN is a
        // duel whose payout is the show's rule, not a knob.
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

/** A seat is a user — teams are gone (mirrors the backend's SeatSchema). */
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
}

// A row of the tournament's standings. The place is how far the player got, not a sum of
// points; the points are a statistic.
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
        // `rounds` is part of the patch because the ROUND LIST is editable too: a
        // tournament created without rounds can only become playable through it.
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

// ── The roster ────────────────────────────────────────────────────────────────

/** The roster — the same rows the players tab lists, group included. */
export function useEnrolled(tournamentId: string) {
    return useQuery({
        queryKey: ["enrolled", tournamentId],
        queryFn: () => api<{ items: ContestantRow[] }>(`/portal/tournaments/${tournamentId}/players`),
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

// ── The AOC group stage ──────────────────────────────────────────────────────

/** One contestant's line in their group (or in the wildcard table). */
export interface GroupRow {
    userId: string
    displayName: string
    matchesPlayed: number
    /** Σ team points this contestant banked for their group. */
    bankedPoints: number
    averages: { phase1: number | null; phase2: number | null; all: number | null }
}

interface GroupTables {
    /** The two groups, in label order; rows are rank-ordered by the engine. */
    groups: Array<{ id: "A" | "B"; teamPoints: number; rows: GroupRow[] }>
    /** Enrolled contestants with no group yet — the operator still has to draw them. */
    unassigned: Array<{ userId: string; displayName: string }>
    /** Every contestant with ≥ 1 match, best pooled average first. */
    wildcard: Array<GroupRow & { avg: number }>
}

/** The group tables — DERIVED on the server from the roster's groups + frozen results. */
export function useGroups(tournamentId: string) {
    return useQuery({
        queryKey: ["groups", tournamentId],
        queryFn: () => api<GroupTables>(`/portal/tournaments/${tournamentId}/groups`),
        enabled: Boolean(tournamentId),
    })
}

/**
 * Make a show-floor contestant: a PLAYER with only a display name, enrolled on
 * the spot. A contestant who never registers an account of their own still needs
 * a seat, so the console creates the identity a seat points at. The backend
 * rejects a duplicate name, because seats, rail cards and verdicts are read by
 * name on the projector.
 */
/** A contestant as the players tab lists them: name, address (or none), group. */
export interface ContestantRow {
    userId: string
    displayName: string
    /** null for a show-floor identity (a placeholder address) — they cannot sign in */
    email: string | null
    /** Has the player opened their mail link? Drives the desk's «Xác thực». */
    emailVerified: boolean
    group: "A" | "B" | null
    enrolledAt: string
}

/** The roster, for the players tab. */
export function useContestants(tournamentId: string) {
    return useQuery({
        queryKey: ["enrolled", tournamentId],
        queryFn: () => api<{ items: ContestantRow[] }>(`/portal/tournaments/${tournamentId}/players`),
        enabled: Boolean(tournamentId),
    })
}

/**
 * Edit a contestant. The address is the interesting half: adding it later is what
 * lets their own Google sign-in attach to this same row, history intact.
 */
export function useUpdateContestant(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (edit: { userId: string; displayName?: string; email?: string | null }) =>
            api<{ userId: string; displayName: string; email: string | null }>(
                `/portal/tournaments/${tournamentId}/players/${edit.userId}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        ...(edit.displayName !== undefined ? { displayName: edit.displayName } : {}),
                        ...(edit.email !== undefined ? { email: edit.email } : {}),
                    }),
                }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
        },
    })
}

/** Off the roster. The server refuses once they have played, or still hold a seat. */
export function useRemoveContestant(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (userId: string) =>
            api<{ removed: string }>(`/portal/tournaments/${tournamentId}/players/${userId}`, {
                method: "DELETE",
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
        },
    })
}

export function useCreateContestant(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        // The optional address lets the player's own sign-in attach to this SAME
        // row later, so their history was never elsewhere. Blank → a placeholder
        // that plays at the show floor and never signs in.
        mutationFn: (input: { displayName: string; email?: string }) =>
            api<{ userId: string; displayName: string; group: "A" | "B" | null }>(
                `/portal/tournaments/${tournamentId}/players/new`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] })
        },
    })
}

/**
 * Enroll an account the PLAYER registered themselves, by its address. The
 * operator never learns the password — there is none to learn. The server
 * refuses an address nobody registered (404), a disabled account (403), and
 * one already on this roster (409). An address that has NOT opened its mail
 * link is accepted: the row lands unverified and the roster's «Xác thực»
 * button (step 7) activates it — on a floor without SMTP the link may never
 * arrive, and refusing it here would keep the account out of the roster.
 */
export function useEnrollByEmail(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (email: string) =>
            api<{ userId: string; displayName: string; email: string; group: "A" | "B" | null }>(
                `/portal/tournaments/${tournamentId}/players/by-email`,
                { method: "POST", body: JSON.stringify({ email }) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] })
        },
    })
}

/** The DRAW: place a contestant in Nhóm A / Nhóm B, or clear it with null. */
export function useAssignGroup(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (placed: { userId: string; group: "A" | "B" | null }) =>
            api<{ userId: string; group: "A" | "B" | null }>(
                `/portal/tournaments/${tournamentId}/players/${placed.userId}/group`,
                { method: "PATCH", body: JSON.stringify({ group: placed.group }) }
            ),
        onSuccess: () => {
            // The roster carries the group, and the tables are derived from it.
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
        },
    })
}

// ── the desk's two account actions ───────────────────────────────────────────────

/**
 * ACTIVATE an account: the operator vouches for the address the player
 * registered, so the mail link stops being a gate on a floor without SMTP.
 * The refusal for a show-floor identity comes back as the row's own error.
 */
export function useActivateContestant(tournamentId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (userId: string) =>
            api<{ userId: string; email: string; emailVerified: boolean }>(
                `/portal/tournaments/${tournamentId}/players/${userId}/verify`,
                { method: "POST" }
            ),
        onSuccess: () => {
            // The roster carries the flag the button reads.
            void queryClient.invalidateQueries({ queryKey: ["enrolled", tournamentId] })
            void queryClient.invalidateQueries({ queryKey: ["groups", tournamentId] })
        },
    })
}

/**
 * FORGOTTEN PASSWORD: a one-time entry code bound to this player's own
 * account — the desk never holds a password, because there is none to hold.
 * The value comes back once, to this screen, and is never cached anywhere.
 */
export function useIssueEntryCode(tournamentId: string) {
    return useMutation({
        mutationFn: (userId: string) =>
            api<{ userId: string; email: string; code: string; expiresAt: string }>(
                `/portal/tournaments/${tournamentId}/players/${userId}/entry-code`,
                { method: "POST" }
            ),
    })
}

// ── the matches: room codes and seats ───────────────────────────────────────

/** A live room code — the secret a walk-in types on /code of the gameplay app. */
export interface RoomCode {
    matchId: string
    code: string
    expiresAt: string
}

/**
 * Every live room code of the tournament, in one read. Write-guarded on the
 * server (a code seats people), so an answer here is also the permission to
 * show one: a 403 renders as "no code controls", not as an error banner.
 */
export function useMatchCodes(tournamentId: string) {
    return useQuery({
        queryKey: ["match-codes", tournamentId],
        queryFn: () => api<{ items: RoomCode[] }>(`/portal/tournaments/${tournamentId}/match-codes`),
        enabled: Boolean(tournamentId),
        // A refusal is an answer (another desk's tournament), never a retry.
        retry: false,
    })
}

/** Mint the room code, or rotate it: the old code dies in the same request. */
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

/** Take ONE seat back — the console's eject for a walk-in who claimed wrong. */
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

// ── The questions ────────────────────────────────────────────────────────────


// The bank's published TEXT questions — what the turn's question may be.
