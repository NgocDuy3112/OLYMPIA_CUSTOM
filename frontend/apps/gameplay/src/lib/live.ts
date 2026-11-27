import { useContext, useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@shared/lib/api"
import type { ServerClock } from "@shared/lib/clock"
import type { LobbyData } from "@shared/deck/types"
import { useHubInvoker, type HubInvoker, type StreamStatus } from "@shared/lib/ws"
import { logError } from "@shared/lib/log"
import { isOlderView, keepNewestRead } from "@shared/lib/view-version"
import { LiveHubContext, type MatchStream } from "@/lib/live-hub-context"

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



import type { AnswerValue, PlayerMe, PlayerQuestion, PlayerScoreRow, PlayerView as LiveView } from "@shared/wire/live"

export type {
    LiveView,
    PlayerMe as LiveMe,
    PlayerQuestion as LiveQuestion,
    PlayerScoreRow as LiveScoreRow,
}

interface StreamFrame {
    v?: number
    type?: "view" | "ack" | "error"
    at?: string
    data?: { view?: LiveView }
}


const liveKey = (matchId: string) => ["live", matchId] as const

export { isOlderView } from "@shared/lib/view-version"

const streamPathOf = (matchId: string) => `/api/matches/${matchId}/live/stream`

interface UseLiveMatch {
    view: LiveView | undefined
    failure: ViewFailure | null
    clock: ServerClock
    streamStatus: StreamStatus
    refetch: () => void
}

export function useLiveHub(
    matchId: string,
    enabled: boolean,
    onFrame?: (at: string) => void
): HubInvoker {
    const queryClient = useQueryClient()
    const path = matchId ? streamPathOf(matchId) : null

    const onMessage = useMemo(
        () => (message: unknown) => {
            const frame = message as StreamFrame | null
            if (!frame || typeof frame !== "object") return

            if (frame.type === "view" && frame.data?.view) {
                if (frame.at) onFrame?.(frame.at)
                const next = frame.data.view
                if (!isOlderView(next, queryClient.getQueryData<LiveView>(liveKey(matchId)))) {
                    queryClient.setQueryData(liveKey(matchId), next)
                }
                return
            }

            if (frame.type === "error") {
                logError("live", frame)
                void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
            }
        },
        [onFrame, matchId, queryClient]
    )

    return useHubInvoker(path, enabled, { onMessage })
}

function useMatchStream(): MatchStream {
    const stream = useContext(LiveHubContext)
    if (stream === null) throw new Error("PlayerShell must own the match hub")
    return stream
}

export function liveRefetchInterval(streamStatus: StreamStatus): 3_000 | false {
    return streamStatus === "live" ? false : 3_000
}

export function useLiveMatch(matchId: string, enabled: boolean): UseLiveMatch {
    const queryClient = useQueryClient()
    const { hub, clock } = useMatchStream()

    const query = useQuery({
        queryKey: liveKey(matchId),
        queryFn: () => api<LiveView>(`/api/matches/${matchId}/live`),
        enabled: enabled && Boolean(matchId),
        retry: false,
        staleTime: Infinity,
        refetchOnWindowFocus: false,
        // A REST read this slow can land behind a stream frame that already moved
        // the room on: the cache keeps whichever version is newer.
        structuralSharing: (old, next) =>
            keepNewestRead(old as LiveView | undefined, next as LiveView),
        refetchInterval: liveRefetchInterval(hub.status),
    })

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

export function useLiveLobby(matchId: string, enabled: boolean, streamStatus: StreamStatus) {
    return useQuery({
        queryKey: lobbyKey(matchId),
        queryFn: () => api<LobbyData>(`/api/matches/${matchId}/lobby`),
        enabled: enabled && Boolean(matchId),
        refetchInterval: liveRefetchInterval(streamStatus),
        retry: false,
        staleTime: 0,
    })
}


export type LivePlayerCommand =
    | { type: "buzz"; questionId: string }

type LivePlayerCommandPost =
    | { type: "buzz"; questionId: string; pressedAt: string }

export type { AnswerValue }

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

import type { TieBreakPlayer, TieBreakView } from "@shared/wire/tiebreak"

export type { TieBreakPlayer, TieBreakView }

const tieBreakKey = (matchId: string) => ["tiebreak", matchId] as const

export function useTieBreakMatch(matchId: string, enabled: boolean) {
    const queryClient = useQueryClient()
    const { hub } = useMatchStream()
    const { ready, invoke } = hub

    const query = useQuery({
        queryKey: tieBreakKey(matchId),
        queryFn: () => api<TieBreakView>(`/api/matches/${matchId}/live/tiebreak`),
        enabled: enabled && Boolean(matchId),
        refetchInterval: 3_000,
        retry: false,
        staleTime: 0,
    })

    const [buzzedFor, setBuzzedFor] = useState<string | null>(null)

    const buzz = useMutation({
        mutationFn: async (questionId: string) => {
            if (!ready) throw new Error("Chuông chưa sẵn sàng")
            const result = await invoke("Buzz", [
                { v: 1, type: "buzz", data: { questionId } },
            ])
            void queryClient.invalidateQueries({ queryKey: tieBreakKey(matchId) })
            return result
        },
        onMutate: (questionId: string) => setBuzzedFor(questionId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: liveKey(matchId) })
        },
        onError: () => {
            setBuzzedFor(null)
            void queryClient.invalidateQueries({ queryKey: tieBreakKey(matchId) })
        },
    })

    const view = query.data
    const buzzed = view !== undefined
        && view.windowOpen
        && view.questionId !== null
        && buzzedFor === view.questionId

    return {
        view,
        refetch: () => void query.refetch(),
        buzz,
        buzzed,
    }
}
