import { useEffect, useMemo, useRef } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import { useServerClock, type ServerClock } from "@shared/lib/clock"
import type { LobbyData } from "@shared/deck/types"
import { useHubInvoker, type HubInvoker, type StreamStatus } from "@shared/lib/ws"
import { logError } from "@shared/lib/log"

interface ViewFailure {
    status: number
    code?: string
    message?: string
}

function failureOf(error: unknown): ViewFailure | null {
    if (!error) return null
    if (error instanceof ApiError) {
        return { status: error.status, code: error.code, message: error.message }
    }
    let message = "Không tải được trận."
    if (error instanceof Error) message = error.message
    return { status: 0, message }
}



export interface LiveQuestion {
    questionId: string
    kind: "CHOICE" | "TEXT" | "KEYWORD"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    payload: { options?: Array<{ id: string; text: string }> }
}

export interface LiveScoreRow {
    id: string
    displayName: string
    points: number
    rank: number
}

export interface LiveMe {
    verdicts?: Record<string, "CORRECT" | "INCORRECT">
    answerState?: "none" | "answered"
    isMyRun?: boolean
    points?: number
    answered?: string[]
    finalized?: string[]
    keywordLocked?: boolean
    eliminated?: boolean
    keywordValue?: number | null
    revealedHints?: Array<{ questionId: string; question: LiveQuestion | null }>
    hintsRevealed?: number
    score?: number
    powersLeft?: Array<"STAR" | "ASSIGN">
    isMyTurn?: boolean
    pendingPicks?: string[]
    isAnswerer?: boolean
    canAnswer?: boolean
    canBuzz?: boolean
    openTile?: number | null
    pickedTiles: number[]
    hintVerdicts: Record<string, string>
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
        frozenRemainingMs?: number | null
        question: LiveQuestion | null
    }>
    table: LiveScoreRow[]
    oral?: {
        questionId: string
        question: LiveQuestion | null
        playerId: string
        index: number
        total: number
        elapsedS: number
        budgetS: number
        deadlineAt: string | null
    } | null
    board?: Array<{
        questionId: string
        value: number
        where: "free" | "pending" | "open" | "taken" | "deferred"
    }>
    console?: { picksConfirmed?: boolean } | null
    keyword?: { questionId: string; question: LiveQuestion | null } | null
    hintAnswers: Record<string, string>
    tiebreak?: TieBreakView | null
    keywordDeadlineAt: string | null
    keywordLength: number
    keywordKind: string
    me: LiveMe
    audioGate?: { allowed: string[] }
}

interface StreamFrame {
    v?: number
    type?: "view" | "ack" | "error"
    at?: string
    data?: { view?: LiveView }
}


const liveKey = (matchId: string) => ["live", matchId] as const

const streamPathOf = (matchId: string) => `/api/matches/${matchId}/live/stream`

interface UseLiveMatch {
    view: LiveView | undefined
    failure: ViewFailure | null
    clock: ServerClock
    streamStatus: StreamStatus
    refetch: () => void
}

/**
 * The single live connection for a match.
 *
 * View frames and hub invocations share one socket: the hub issues one ticket
 * per identity, so a second connection to the same path gets refused and
 * silently kills whichever side lost the race. Both the deck and the tiebreak
 * buzz go through here.
 */
export function useLiveHub(matchId: string, enabled: boolean): HubInvoker {
    const queryClient = useQueryClient()
    const clock = useServerClock()
    const path = matchId ? streamPathOf(matchId) : null

    const onMessage = useMemo(
        () => (message: unknown) => {
            const frame = message as StreamFrame | null
            if (!frame || typeof frame !== "object") return

            if (frame.type === "view" && frame.data?.view) {
                if (frame.at) clock.sync(frame.at)
                queryClient.setQueryData(liveKey(matchId), frame.data.view)
                return
            }

            if (frame.type === "error") {
                logError("live", frame)
                void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
            }
        },
        [clock, matchId, queryClient]
    )

    return useHubInvoker(path, enabled, { onMessage })
}

export function useLiveMatch(matchId: string, enabled: boolean): UseLiveMatch {
    const queryClient = useQueryClient()
    const clock = useServerClock()

    const query = useQuery({
        queryKey: liveKey(matchId),
        queryFn: () => api<LiveView>(`/api/matches/${matchId}/live`),
        enabled: enabled && Boolean(matchId),
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        // The stream is the primary source. While it is down the view is stale
        // by definition, so fall back to polling instead of freezing the deck.
        refetchInterval: (state) => {
            if (state.state.data === undefined) return false
            if (state.state.error) return 3_000
            return false
        },
    })

    const hub = useLiveHub(matchId, enabled && Boolean(matchId))

    // Missed frames are never replayed: after every (re)connect pull the
    // authoritative view once, so a drop heals instead of leaving a dead screen.
    const lastGeneration = useRef(-1)
    useEffect(() => {
        if (!matchId) return
        if (hub.generation === lastGeneration.current) return
        lastGeneration.current = hub.generation
        void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
    }, [matchId, hub.generation, queryClient])

    return {
        view: query.data,
        failure: failureOf(query.error),
        clock,
        streamStatus: hub.status,
        refetch: () => void query.refetch(),
    }
}


export { playerScreenOf, type PlayerScreen } from "@shared/deck/dispatch"


const lobbyKey = (matchId: string) => ["lobby", matchId] as const

export function useLiveLobby(matchId: string, enabled: boolean) {
    return useQuery({
        queryKey: lobbyKey(matchId),
        queryFn: () => api<LobbyData>(`/api/matches/${matchId}/lobby`),
        enabled: enabled && Boolean(matchId),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })
}


export type LivePlayerCommand =
    | { type: "buzz"; questionId: string }

type LivePlayerCommandPost =
    | { type: "buzz"; questionId: string; pressedAt: string }

export type AnswerValue = { picked?: string[]; text?: string }

function useLiveCommandPost<TInput>(matchId: string, suffix: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: TInput) =>
            api<unknown>(`/api/matches/${matchId}/live/${suffix}`, {
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
    return useLiveCommandPost<{ questionId: string; value: AnswerValue; pressedAt: string }>(matchId, "answers")
}

export function useLiveKeyword(matchId: string) {
    return useLiveCommandPost<{ questionId: string; value: { text: string }; pressedAt: string }>(
        matchId, "keyword")
}

export function useLivePlayerCommand(matchId: string) {
    return useLiveCommandPost<LivePlayerCommandPost>(matchId, "commands")
}

export interface TieBreakMedia {
    url: string
    type: string
}

export interface TieBreakQuestion {
    questionId: string
    kind: "CHOICE" | "TEXT" | "KEYWORD"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    payload: { options?: Array<{ id: string; text: string }> }
}

export interface TieBreakPlayer {
    id: string
    displayName: string
    points: number
    rank: number
    eliminated: boolean
}

export interface TieBreakView {
    matchId: string
    version: number
    stage: string
    questionId: string | null
    cursor: number
    ended: boolean
    window: { buzzer: string | null; buzzerMs: number | null; locked: boolean }
    windowOpen: boolean
    deadlineAt: string | null
    players: TieBreakPlayer[]
    me: TieBreakPlayer | null
    question: TieBreakQuestion | null
}

const tieBreakKey = (matchId: string) => ["tiebreak", matchId] as const

export function useTieBreakMatch(matchId: string, enabled: boolean) {
    const queryClient = useQueryClient()
    // Same socket as the deck — see useLiveHub.
    const { ready, invoke } = useLiveHub(matchId, enabled && Boolean(matchId))

    const query = useQuery({
        queryKey: tieBreakKey(matchId),
        queryFn: () => api<TieBreakView>(`/api/matches/${matchId}/live/tiebreak`),
        enabled: enabled && Boolean(matchId),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })

    const buzz = useMutation({
        mutationFn: async (questionId: string) => {
            if (!ready) throw new Error("Chuông chưa sẵn sàng")
            const result = await invoke("Buzz", [
                { v: 1, type: "buzz", data: { questionId } },
            ])
            void queryClient.invalidateQueries({ queryKey: tieBreakKey(matchId) })
            return result
        },
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: tieBreakKey(matchId) })
        },
    })

    return {
        view: query.data,
        refetch: () => void query.refetch(),
        buzz,
    }
}
