import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import { useServerClock, type ServerClock } from "@shared/lib/clock"
import type { LobbyData } from "@shared/deck/types"
import { useSocketStream } from "@shared/lib/ws"

// An API refusal, shaped for the gate screens: each status is a screen, never
// a crash. A non-API error becomes status 0 so it lands in the "say why" branch.
export interface ViewFailure {
    status: number
    code?: string
    message?: string
}

export function failureOf(error: unknown): ViewFailure | null {
    if (!error) return null
    if (error instanceof ApiError) {
        return { status: error.status, code: error.code, message: error.message }
    }
    return { status: 0, message: error instanceof Error ? error.message : "Không tải được trận." }
}

// The player's live match client — HTTP up, socket down (the transport decision,
// docs/live-surface.md § L3):
//
//   send     → plain POSTs to /live/answers, /live/keyword, /live/commands
//              (the same commands the socket accepts; session owns the user id)
//   receive  → full `view` snapshots pushed over /live/stream (initial view on
//              connect), plus GET /live as the pre-connect paint
//   after a command → refetch, so the view is right even if the socket was down
//
// Push-first: no polling anywhere. Countdowns run on the shared clock — every
// pushed envelope's `at` re-anchors the skew, never the client's own time.

// ── the wire ─────────────────────────────────────────────────────────────────

export interface LiveQuestion {
    questionId: string
    kind: "CHOICE" | "TEXT" | "KEYWORD" | "HINT"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    timeLimit: number | null
    // CHOICE carries options; never the correct set — the sanitizer's rule.
    payload: { options?: Array<{ id: string; text: string }> }
}

export interface LiveScoreRow {
    id: string
    displayName: string
    points: number
    rank: number
}

// Every field optional: the view grows per round, and a screen must degrade
// gracefully when a field belongs to another round.
export interface LiveMe {
    verdicts?: Record<string, "CORRECT" | "INCORRECT">
    answerState?: "none" | "draft" | "final"
    // khoi-dong
    isMyRun?: boolean
    points?: number
    answered?: string[]
    finalized?: string[]
    // giai-ma
    keywordLocked?: boolean
    eliminated?: boolean
    keywordValue?: number | null
    revealedHints?: Array<{ questionId: string; question: LiveQuestion | null }>
    hintsRevealed?: number
    // ve-dich
    score?: number
    powersLeft?: Array<"STAR" | "ASSIGN">
    isMyTurn?: boolean
    pendingPicks?: string[]
    isAnswerer?: boolean
    canAnswer?: boolean
    canDeclarePower?: boolean
    canBuzz?: boolean
    power?: "STAR" | "ASSIGN" | null
    buzzer?: string | null
}

export interface LiveView {
    matchId: string
    roundId: string
    version: number
    stage: string
    open: Array<{
        questionId: string
        deadlineAt: string | null
        question: LiveQuestion | null
    }>
    table: LiveScoreRow[]
    // khoi-dong phase 1: the active run's question — on EVERY seated screen.
    oral?: {
        questionId: string
        question: LiveQuestion | null
        playerId: string
        index: number
        total: number
        elapsedS: number
        budgetS: number
    } | null
    // ve-dich: free cells + this turn's batch + the open question.
    board?: Array<{
        questionId: string
        value: number
        where: "free" | "pending" | "open" | "taken" | "deferred"
    }>
    // giai-ma: THE keyword question.
    keyword?: { questionId: string; question: LiveQuestion | null } | null
    me: LiveMe
}

// The stream's frames — the subset this client reads.
interface StreamFrame {
    v?: number
    type?: "view" | "ack" | "error"
    at?: string
    data?: { view?: LiveView }
}

// ── the query + push ─────────────────────────────────────────────────────────

export const liveKey = (matchId: string) => ["live", matchId] as const

export interface UseLiveMatch {
    /** The last known view — a pushed snapshot replaces the GET's paint. */
    view: LiveView | undefined
    /** ApiError → the gate screen reads it (401 / 403 / 409 are answers). */
    failure: ViewFailure | null
    clock: ServerClock
    refetch: () => void
}

export function useLiveMatch(matchId: string, enabled: boolean): UseLiveMatch {
    const queryClient = useQueryClient()
    const clock = useServerClock()

    const query = useQuery({
        queryKey: liveKey(matchId),
        queryFn: () => api<LiveView>(`/gameplay/matches/${matchId}/live`),
        enabled: enabled && Boolean(matchId),
        // 401/403/409 are answers, not failures to retry through; push is the
        // only refetch channel after the first paint.
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
    })

    useSocketStream(
        enabled && matchId ? `/gameplay/matches/${matchId}/live/stream` : null,
        true,
        (message) => {
            const frame = message as StreamFrame | null
            if (!frame || typeof frame !== "object") return

            if (frame.type === "view" && frame.data?.view) {
                // Every push carries the server's `at`: the clock re-anchors, then
                // the snapshot lands as the new truth (no refetch needed).
                if (frame.at) clock.sync(frame.at)
                queryClient.setQueryData(liveKey(matchId), frame.data.view)
                return
            }

            if (frame.type === "error") {
                // e.g. UNAVAILABLE (the match left LIVE): let HTTP answer the gate.
                void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
            }
        }
    )

    return {
        view: query.data,
        failure: failureOf(query.error),
        clock,
        refetch: () => void query.refetch(),
    }
}

// ── which screen a view renders ────────────────────────────────────────────

// The screen rule lives with the kit (shared/deck/dispatch) so the audience deck
// uses the SAME routing. Re-exported here: gameplay's call sites keep one import.
export { playerScreenOf, type PlayerScreen } from "@shared/deck/dispatch"

// ── the lobby ───────────────────────────────────────────────────────────────────

export const lobbyKey = (matchId: string) => ["lobby", matchId] as const

/**
 * The player's lobby read — asked WHILE WAITING: /live 409s until the match is
 * LIVE and says "pending" until the console starts a round, but the lobby answers
 * in every case — seats, connected dots, the round waiting to start.
 */
export function useLiveLobby(matchId: string, enabled: boolean) {
    return useQuery({
        queryKey: lobbyKey(matchId),
        queryFn: () => api<LobbyData>(`/gameplay/matches/${matchId}/lobby`),
        enabled: enabled && Boolean(matchId),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })
}

// ── the three commands ───────────────────────────────────────────────────────

// ve-dich's player vocabulary, exactly as /live/commands validates it.
export type LivePlayerCommand =
    | { type: "pick"; questionId: string }
    | { type: "pickBatch"; questionIds: string[] }
    | { type: "power"; power: "STAR" | "ASSIGN"; targetId?: string }
    | { type: "buzz"; questionId: string }

export type AnswerValue = { picked?: string[]; text?: string }

// One POST shape for all three: refetch after every success (the view is right
// even if the socket was down), and after every 409 (the refusal means the
// window moved on — the view is the answer).
function useLiveCommandPost<TInput>(matchId: string, suffix: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: TInput) =>
            api<unknown>(`/gameplay/matches/${matchId}/live/${suffix}`, {
                method: "POST",
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
        },
        onError: (error) => {
            if (error instanceof ApiError && error.status === 409) {
                void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
            }
        },
    })
}

/** Khởi động chung: the phase's only action — the buzz. */
export function useLiveBuzz(matchId: string) {
    return useLiveCommandPost<Record<string, never>>(matchId, "buzz")
}

export function useLiveAnswer(matchId: string) {
    return useLiveCommandPost<{ questionId: string; value: AnswerValue }>(matchId, "answers")
}

export function useLiveKeyword(matchId: string) {
    return useLiveCommandPost<{ questionId: string; value: { text: string } }>(matchId, "keyword")
}

export function useLivePlayerCommand(matchId: string) {
    return useLiveCommandPost<LivePlayerCommand>(matchId, "commands")
}
