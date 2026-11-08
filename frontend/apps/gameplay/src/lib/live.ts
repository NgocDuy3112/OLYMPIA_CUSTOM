import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import { useServerClock, type ServerClock } from "@shared/lib/clock"
import type { LobbyData } from "@shared/deck/types"
import { useSocketStream } from "@shared/lib/ws"

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
    return { status: 0, message: error instanceof Error ? error.message : "Không tải được trận." }
}



export interface LiveQuestion {
    questionId: string
    kind: "CHOICE" | "TEXT" | "KEYWORD" | "HINT"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    timeLimit: number | null
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
    answerState?: "none" | "draft" | "final"
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
    oral?: {
        questionId: string
        question: LiveQuestion | null
        playerId: string
        index: number
        total: number
        elapsedS: number
        budgetS: number
    } | null
    board?: Array<{
        questionId: string
        value: number
        where: "free" | "pending" | "open" | "taken" | "deferred"
    }>
    keyword?: { questionId: string; question: LiveQuestion | null } | null
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

interface UseLiveMatch {
    view: LiveView | undefined
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
                if (frame.at) clock.sync(frame.at)
                queryClient.setQueryData(liveKey(matchId), frame.data.view)
                return
            }

            if (frame.type === "error") {
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


export { playerScreenOf, type PlayerScreen } from "@shared/deck/dispatch"


const lobbyKey = (matchId: string) => ["lobby", matchId] as const

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


export type LivePlayerCommand =
    | { type: "buzz"; questionId: string }

export type AnswerValue = { picked?: string[]; text?: string }

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
