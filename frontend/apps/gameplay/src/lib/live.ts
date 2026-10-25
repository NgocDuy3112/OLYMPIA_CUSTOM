import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import { useServerClock, type ServerClock } from "@shared/lib/clock"
import { useSocketStream } from "./ws"
import { failureOf } from "./qualification"
import type { ViewFailure } from "./qualification-state"

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
    kind: "MC" | "TEXT" | "KEYWORD"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    timeLimit: number | null
    tag: string
    // MC carries options; never the correct set — the sanitizer's rule.
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
    powersLeft?: Array<"HOPE" | "SHIELD">
    isMyTurn?: boolean
    pendingPicks?: string[]
    isAnswerer?: boolean
    canAnswer?: boolean
    canDeclarePower?: boolean
    canBuzz?: boolean
    power?: "HOPE" | "SHIELD" | null
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
        domain: string
        value: number
        where: "free" | "pending" | "open"
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

// ── the screens ──────────────────────────────────────────────────────────────

export type LiveScreen =
    | "lobby"           // round not started / ended — waiting for the MC
    | "khoi-dong-oral"  // phase 1: the oral question on every screen, budget bar
    | "khoi-dong-batch" // phase 2: 6 questions, shared 60 s
    | "giai-ma-window"  // a hint's 15 s window is open
    | "giai-ma-idle"    // between windows: hints, keyword box
    | "but-pha"         // one question, 30 s sprint
    | "ve-dich"         // turns, board, buzz, powers
    | "unknown"         // a round this client does not know — say so, stay calm

/**
 * Which screen a view renders. Pure — the view is the only input, so the rule is
 * unit-testable and the component never re-derives it.
 *
 * Ended stages read as `lobby`: a finished round is exactly "waiting for the MC
 * to advance", which is what the lobby says.
 */
export function screenFor(view: LiveView): LiveScreen {
    if (view.stage === "pending") return "lobby"

    switch (view.roundId) {
        case "khoi-dong":
            if (view.stage === "phase1") return "khoi-dong-oral"
            if (view.stage === "phase2") return "khoi-dong-batch"
            return "unknown"
        case "giai-ma":
            if (view.stage === "ended") return "lobby"
            if (view.open.length > 0) return "giai-ma-window"
            if (view.stage === "hints") return "giai-ma-idle"
            return "unknown"
        case "but-pha":
            if (view.stage === "question") return "but-pha"
            if (view.stage === "ended") return "lobby"
            return "unknown"
        case "ve-dich":
            if (view.stage === "phase1" || view.stage === "phase2") return "ve-dich"
            if (view.stage === "ended") return "lobby"
            return "unknown"
        default:
            return "unknown"
    }
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

// ── the three commands ───────────────────────────────────────────────────────

// ve-dich's player vocabulary, exactly as /live/commands validates it.
export type LivePlayerCommand =
    | { type: "pick"; questionId: string }
    | { type: "pickBatch"; questionIds: string[] }
    | { type: "power"; power: "HOPE" | "SHIELD" }
    | { type: "buzz"; questionId: string }

export type AnswerValue = { picked?: string[]; text?: string }

// One POST shape for all three: refetch after every success (the view is right
// even if the socket was down), and after every 409 (the refusal means the
// window moved on — the view is the answer, exactly like the mass event).
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

export function useLiveAnswer(matchId: string) {
    return useLiveCommandPost<{ questionId: string; value: AnswerValue }>(matchId, "answers")
}

export function useLiveKeyword(matchId: string) {
    return useLiveCommandPost<{ questionId: string; value: { text: string } }>(matchId, "keyword")
}

export function useLivePlayerCommand(matchId: string) {
    return useLiveCommandPost<LivePlayerCommand>(matchId, "commands")
}
