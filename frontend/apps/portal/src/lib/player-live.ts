import { useEffect, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import { useServerClock, type ServerClock } from "@shared/lib/clock"
import type { LobbyData } from "./live"

// The portal's PLAYER surface client — the PIN join lands here, so the portal
// speaks the player protocol directly (same endpoints as the gameplay app,
// docs/live-surface.md § L3: HTTP up, socket down).
//
//   send     → POST /gameplay/matches/:id/live/{answers,keyword,commands}
//              (session owns the user id — never body-claimed)
//   receive  → GET /live as the pre-connect paint + pushed `view` snapshots
//              over /live/stream (the portal vite proxy carries the upgrade)
//   identity → GET /gameplay/auth/me (the GAMEPLAY cookie the PIN claim set)
//
// Push-first, no polling: countdowns run on the shared clock, every pushed
// envelope's `at` re-anchors the skew, never this machine's clock.

// ── the wire ─────────────────────────────────────────────────────────────────

export interface PlayerQuestion {
    questionId: string
    kind: "MC" | "TEXT" | "KEYWORD"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    timeLimit: number | null
    tag: string
    // MC carries options; KEYWORD carries the public code length (D3).
    payload: { options?: Array<{ id: string; text: string }>; codeLength?: number }
}

export interface PlayerScoreRow {
    id: string
    displayName: string
    points: number
    rank: number
}

/** The private `me` slice — every field optional: the view grows per round. */
export interface PlayerMe {
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
    revealedHints?: Array<{ questionId: string; question: PlayerQuestion | null }>
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

export interface PlayerView {
    matchId: string
    roundId: string
    version: number
    stage: string
    open: Array<{
        questionId: string
        deadlineAt: string | null
        question: PlayerQuestion | null
    }>
    table: PlayerScoreRow[]
    // khoi-dong phase 1: the active oral run — on EVERY seated screen.
    oral?: {
        questionId: string
        question: PlayerQuestion | null
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
    keyword?: { questionId: string; question: PlayerQuestion | null } | null
    me: PlayerMe
}

interface StreamFrame {
    v?: number
    type?: "view" | "ack" | "error"
    at?: string
    data?: { view?: PlayerView }
}

// ── the socket (the gameplay app's ws.ts, scoped here) ───────────────────────

const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000
// 4401 SESSION_ENDED / 4403 NOT_SEATED — reconnecting will never fix these.
const STOP_CODES = new Set([4401, 4403])

function wsBase(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}`
}

/**
 * Dial `path` while `enabled`. Every parsed frame goes to `onMessage`; the
 * callback lives in a ref (a new closure never re-dials); backoff 2 s → 30 s,
 * reset on open; STOP_CODES end the stream for good.
 */
function useSocketStream(path: string | null, enabled: boolean, onMessage: (message: unknown) => void) {
    const handler = useRef(onMessage)
    useEffect(() => {
        handler.current = onMessage
    }, [onMessage])

    useEffect(() => {
        if (!enabled || !path) return

        let socket: WebSocket | null = null
        let stopped = false
        let attempt = 0
        let timer: ReturnType<typeof setTimeout> | undefined

        const connect = () => {
            if (stopped) return
            socket = new WebSocket(`${wsBase()}${path}`)
            socket.onmessage = (event) => {
                try {
                    handler.current(JSON.parse(String(event.data)))
                } catch {
                    // Malformed frame: ignore — HTTP stays the truth either way.
                }
            }
            socket.onopen = () => {
                attempt = 0
            }
            socket.onclose = (event) => {
                if (stopped || STOP_CODES.has(event.code)) return
                const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
                attempt += 1
                timer = setTimeout(connect, delay)
            }
        }

        connect()

        return () => {
            stopped = true
            if (timer !== undefined) clearTimeout(timer)
            if (socket) {
                socket.onclose = null
                socket.close()
            }
        }
    }, [path, enabled])
}

// ── identity: the GAMEPLAY cookie the PIN claim minted ───────────────────────

export interface GameplayUser {
    id: string
    username: string | null
    displayName: string
    role: "ADMIN" | "OPERATOR" | "PLAYER"
}

export const PLAYER_ME_KEY = ["player-me"] as const

export function usePlayerMe(enabled: boolean) {
    return useQuery({
        queryKey: PLAYER_ME_KEY,
        queryFn: () => api<GameplayUser>("/gameplay/auth/me"),
        enabled,
        retry: false,
        staleTime: 5 * 60_000,
    })
}

// ── the view query + push ────────────────────────────────────────────────────

export const playerLiveKey = (matchId: string) => ["player-live", matchId] as const

export const playerLobbyKey = (matchId: string) => ["player-lobby", matchId] as const

/**
 * The player's lobby read — asked WHILE WAITING: /live 409s until the match is
 * LIVE and says "pending" until the MC starts a round, but the lobby answers
 * either way (identity + seats + presence). 3 s poll: presence moves without a
 * view push.
 */
export function usePlayerLobby(matchId: string, enabled: boolean) {
    return useQuery({
        queryKey: playerLobbyKey(matchId),
        queryFn: () => api<LobbyData>(`/gameplay/matches/${matchId}/lobby`),
        enabled: enabled && Boolean(matchId),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })
}

export interface UsePlayerLive {
    view: PlayerView | undefined
    /** ApiError → the gate reads it (401 no session / 403 not seated / 409 not LIVE). */
    error: unknown
    failureStatus: number | null
    clock: ServerClock
    refetch: () => void
}

export function usePlayerLive(matchId: string, enabled: boolean): UsePlayerLive {
    const queryClient = useQueryClient()
    const clock = useServerClock()

    const query = useQuery({
        queryKey: playerLiveKey(matchId),
        queryFn: () => api<PlayerView>(`/gameplay/matches/${matchId}/live`),
        enabled: enabled && Boolean(matchId),
        // 401/403/409 are answers, not retries; push is the only refetch channel.
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
                // The pushed envelope carries the server clock: re-anchor, then
                // the snapshot lands as the new truth (no refetch needed).
                if (frame.at) clock.sync(frame.at)
                queryClient.setQueryData(playerLiveKey(matchId), frame.data.view)
                return
            }

            if (frame.type === "error") {
                // e.g. UNAVAILABLE (the match left LIVE): let HTTP answer the gate.
                void queryClient.invalidateQueries({ queryKey: playerLiveKey(matchId) })
            }
        }
    )

    const failureStatus = query.error instanceof ApiError ? query.error.status : null

    return {
        view: query.data,
        error: query.error,
        failureStatus,
        clock,
        refetch: () => void query.refetch(),
    }
}

// ── the commands ─────────────────────────────────────────────────────────────

export type AnswerValue = { picked?: string[]; text?: string }

export type VeDichCommand =
    | { type: "pick"; questionId: string }
    | { type: "pickBatch"; questionIds: string[] }
    | { type: "power"; power: "HOPE" | "SHIELD" }
    | { type: "buzz"; questionId: string }

// One POST shape for all of them: refetch after every success (the view is
// right even if the socket was down) and after every 409 (the window moved on
// — the view is the answer).
function usePlayerPost<TInput>(matchId: string, suffix: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: TInput) =>
            api<unknown>(`/gameplay/matches/${matchId}/live/${suffix}`, {
                method: "POST",
                body: JSON.stringify(input),
            }),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: playerLiveKey(matchId) })
        },
        onError: (error) => {
            if (error instanceof ApiError && error.status === 409) {
                void queryClient.invalidateQueries({ queryKey: playerLiveKey(matchId) })
            }
        },
    })
}

export function usePlayerAnswer(matchId: string) {
    return usePlayerPost<{ questionId: string; value: AnswerValue }>(matchId, "answers")
}

export function usePlayerKeyword(matchId: string) {
    return usePlayerPost<{ questionId: string; value: { text: string } }>(matchId, "keyword")
}

export function useVeDichCommand(matchId: string) {
    return usePlayerPost<VeDichCommand>(matchId, "commands")
}

/** Non-409 refusals only — a 409 is a race the server won; the view corrects it. */
export function refusalOf(error: unknown): string | null {
    if (!error) return null
    if (error instanceof ApiError && error.status === 409) return null
    return error instanceof Error ? error.message : "Không gửi được — thử lại"
}
