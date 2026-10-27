import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"

// The MC console's data layer: one polled read, one version-guarded action
// writer, one drafts reader for judging — plus the pure helpers that decide
// what the tools show (unit-tested in tests/lib/live.test.ts).

// ── the wire (mirrors the backend's live contract) ───────────────────────────

export interface ConsoleQuestion {
    _id: string
    kind: "MC" | "TEXT" | "KEYWORD"
    roundId: string
    turnId: string
    position: number
    questionText: string
    timeLimit: number | null
    points: number
    tag: string
    // The JUDGE sees everything: options and the correct set are both here on
    // purpose — this is the staff route's own copy of the frozen set.
    payload: { options?: Array<{ id: string; text: string }>; [key: string]: unknown }
}

export interface SanitizedQuestion {
    questionId: string
    kind: string
    position: number
    questionText: string
    media: { url: string; type: string } | null
    timeLimit: number | null
    tag: string
    payload: { options?: Array<{ id: string; text: string }> }
}

export interface Projection {
    matchId: string
    roundId: string
    version: number
    stage: string
    open: Array<{ questionId: string; deadlineAt: string | null; question: SanitizedQuestion | null }>
    table: Array<{ id: string; displayName: string; points: number; rank: number }>
    oral?: {
        questionId: string
        question: SanitizedQuestion | null
        playerId: string
        index: number
        total: number
        elapsedS: number
        budgetS: number
    } | null
    board?: Array<{ questionId: string; domain: string; value: number; where: "free" | "pending" | "open" }>
}

export interface GiaiMaMc {
    hintsRemaining: string[]
    hintsPicked: string[]
    openHintId: string | null
    players: Array<{ id: string; keywordLocked: boolean; eliminated: boolean }>
}
export interface VeDichMc {
    phase: 1 | 2
    turnPlayerId: string | null
    openStage: "current" | "buzz" | null
    answererId: string | null
    buzzerId: string | null
    power: "HOPE" | "SHIELD" | null
    pendingQuestionId: string | null
}
export interface KhoiDongMc {
    phase2Begun: boolean
    phase2Closed: boolean
}

export interface LiveResponse {
    version: number
    roundId: string
    state: Record<string, unknown>
    questions: ConsoleQuestion[]
    projection: Projection
    roundEnded: boolean
    /** User ids with a live player socket right now — the rail's connected dots. */
    connected?: string[]
    mc: Record<string, unknown> | null
}

// ── the lobby (both surfaces wait on this) ───────────────────────────────────

/** The waiting screen's payload: identity, seats+totals, who's connected, rounds. */
export interface LobbyData {
    title: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    /** The round waiting to start (the live record's, else the match's first). */
    roundId: string | null
    /** The match's rounds in tournament order — the controller's start buttons. */
    rounds: Array<{ id: string; name: string }>
    table: Array<{ id: string; displayName: string; points: number; rank: number }>
    /** User ids with a live socket right now — the lobby's connected dots. */
    connected: string[]
}

export const lobbyKey = (tournamentId: string, matchId: string) =>
    ["lobby", tournamentId, matchId] as const

/** The MC's lobby read: polled like /live (presence moves without a round change). */
export function useLobby(tournamentId: string, matchId: string, enabled: boolean) {
    return useQuery({
        queryKey: lobbyKey(tournamentId, matchId),
        queryFn: () =>
            api<LobbyData>(`/portal/tournaments/${tournamentId}/matches/${matchId}/lobby`),
        enabled: enabled && Boolean(tournamentId && matchId),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })
}

export interface QuestionAnswerRow {
    userId: string
    value: { picked?: string[]; text?: string; oral?: true } | null
    verdict: "CORRECT" | "INCORRECT" | null
    judged: boolean
    pointsAwarded: number | null
}

// ── the reads / writes ───────────────────────────────────────────────────────

export const liveKey = (tournamentId: string, matchId: string) =>
    ["live", tournamentId, matchId] as const

// The console's eyes: poll while the round runs. 404 (no round yet) and 409 are
// answers, not crashes — no retry storm.
export function useLive(tournamentId: string, matchId: string) {
    return useQuery({
        queryKey: liveKey(tournamentId, matchId),
        queryFn: () =>
            api<LiveResponse>(`/portal/tournaments/${tournamentId}/matches/${matchId}/live`),
        enabled: Boolean(tournamentId && matchId),
        refetchInterval: 3_000,
        staleTime: 0,
        retry: false,
    })
}

// Every action carries the version it was read from. The server rejects a stale
// one (409 CONFLICT with both versions) — we then reload and show its message:
// reject, don't queue.
export function useLiveAction(tournamentId: string, matchId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { expectedVersion: number; action: Record<string, unknown> }) =>
            api<{ version?: number }>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["live"] })
            void queryClient.invalidateQueries({ queryKey: ["question-answers"] })
        },
        onError: () => {
            // A refusal still means our view is suspect (another console may have
            // acted) — reload so the next buttons reflect reality.
            void queryClient.invalidateQueries({ queryKey: ["live"] })
        },
    })
}

// The drafts ledger for ONE question — the judging panel's raw material.
export function useQuestionAnswers(tournamentId: string, matchId: string, questionId: string | null) {
    return useQuery({
        queryKey: ["question-answers", matchId, questionId],
        queryFn: () =>
            api<QuestionAnswerRow[]>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/live/answers?questionId=${questionId}`
            ),
        enabled: Boolean(questionId),
        retry: false,
    })
}

// ── pure decisions (tested) ──────────────────────────────────────────────────

// The hints the MC may still open: everything not yet consumed, the currently
// open window excluded (it gets its own panel), text resolved from the frozen set.
export function hintPool(
    mc: GiaiMaMc | null,
    questions: ConsoleQuestion[]
): Array<{ questionId: string; text: string }> {
    if (!mc) return []
    const byId = new Map(questions.map((q) => [q._id, q]))
    return mc.hintsRemaining
        .filter((id) => id !== mc.openHintId && !mc.hintsPicked.includes(id))
        .map((id) => ({ questionId: id, text: byId.get(id)?.questionText ?? id }))
}

// The verdicts to SEND with a finalize: one per answered player — the engine's
// own auto-matched draft, overridden wherever the MC toggled it. A row without a
// draft (nothing matched) defaults to incorrect; the MC can flip it.
export function mergedVerdicts(
    questionId: string,
    rows: QuestionAnswerRow[],
    overrides: Record<string, boolean>
): Array<{ playerId: string; correct: boolean }> {
    return rows.map((row) => ({
        playerId: row.userId,
        correct: overrides[`${questionId}:${row.userId}`] ?? row.verdict === "CORRECT"
    }))
}

// The `start` action's payloads differ per round: giai-ma needs the field and the
// hint order resolved server-side style (from the frozen set, keyword excluded);
// every other round starts bare.
export function startActionPayload(
    roundId: string,
    playerIds: string[],
    questions: ConsoleQuestion[]
): Record<string, unknown> {
    if (roundId !== "giai-ma") return {}
    const hintIds = questions
        .filter((q) => q.roundId === roundId && q.kind !== "KEYWORD")
        .sort((a, b) => a.position - b.position)
        .map((q) => q._id)
    return { playerIds, hintIds }
}
