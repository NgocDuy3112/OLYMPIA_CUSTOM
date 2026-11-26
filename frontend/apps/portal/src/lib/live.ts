import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import { logError } from "@shared/lib/log"
import { playSfx, stopSfx } from "@shared/lib/sfx"
import { useSocketStream } from "@shared/lib/ws"
import type { LiveAction, Verdict } from "./live-actions"
import type {
    ButPhaConsole,
    GiaiMaConsole,
    KhoiDongConsole,
    LiveResponse,
    MatchController,
    Projection,
    QuestionAnswerRow,
    VeDichConsole,
} from "@shared/wire/live"
import type { ConsoleQuestion, SanitizedQuestion } from "@shared/wire/questions"

export type {
    ButPhaConsole,
    ConsoleQuestion,
    GiaiMaConsole,
    KhoiDongConsole,
    LiveResponse,
    MatchController,
    Projection,
    QuestionAnswerRow,
    SanitizedQuestion,
    VeDichConsole,
}

export function postControl(
    tournamentId: string,
    matchId: string,
    takeover: boolean
): Promise<MatchController> {
    return api<MatchController>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/live/control`,
        { method: "POST", body: JSON.stringify({ takeover }) }
    )
}

export function postHeartbeat(tournamentId: string, matchId: string): Promise<MatchController> {
    return api<MatchController>(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/live/heartbeat`,
        { method: "POST" }
    )
}


import type { LobbyData } from "@shared/deck/types"

export type { LobbyData }

const lobbyKey = (tournamentId: string, matchId: string) =>
    ["lobby", tournamentId, matchId] as const

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

const liveKey = (tournamentId: string, matchId: string) =>
    ["live", tournamentId, matchId] as const

interface ConsoleStreamFrame {
    v?: number
    type?: "console" | "error" | "sfx"
    at?: string
    data?: { view?: LiveResponse; name?: string; url?: string; stop?: boolean }
}

export function useLive(tournamentId: string, matchId: string, onFrame?: (at: string) => void) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: liveKey(tournamentId, matchId),
        queryFn: () =>
            api<LiveResponse>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/live`
            ),
        enabled: Boolean(tournamentId && matchId),
        refetchInterval: (query) => {
            if (query.state.status === "error") {
                if (query.state.data) return 3_000
                return 15_000
            }
            return 3_000
        },
        staleTime: 0,
        retry: false,
    })

    useSocketStream(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/live/stream`,
        Boolean(tournamentId && matchId),
        (message) => {
            const frame = message as ConsoleStreamFrame | null
            if (!frame || typeof frame !== "object") return

            if (frame.type === "sfx") {
                if (frame.data?.stop === true) stopSfx()
                else if (frame.data?.url) playSfx(frame.data.url)
                return
            }

            if (frame.type === "console" && frame.data?.view) {
                if (frame.at) onFrame?.(frame.at)
                queryClient.setQueryData<LiveResponse>(liveKey(tournamentId, matchId), frame.data.view)
                return
            }

            if (frame.type === "error") {
                logError("live", frame.data ?? "error frame")
                void queryClient.invalidateQueries({ queryKey: liveKey(tournamentId, matchId) })
            }
        }
    )

    return query
}

export function useLiveAction(tournamentId: string, matchId: string) {
    const queryClient = useQueryClient()

    const post = async (action: LiveAction) =>
        await api<unknown>(
            `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`,
            { method: "POST", body: JSON.stringify({ action }) }
        )

    return useMutation({
        mutationFn: post,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["live"] })
            void queryClient.invalidateQueries({ queryKey: ["question-answers"] })
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: ["live"] })
        },
    })
}


export function hintPool(
    mc: GiaiMaConsole | null,
    questions: ConsoleQuestion[]
): Array<{ questionId: string; text: string }> {
    if (!mc) return []
    const byId = new Map(questions.map((q) => [q._id, q]))
    return mc.hintsRemaining
        .filter((id) => id !== mc.openHintId && !mc.hintsPicked.includes(id))
        .map((id) => ({ questionId: id, text: byId.get(id)?.questionText ?? id }))
}

export function mergedVerdicts(
    questionId: string,
    rows: QuestionAnswerRow[],
    overrides: Record<string, boolean>
): Verdict[] {
    return rows.flatMap((row) => {
        const correct = overrides[`${questionId}:${row.userId}`]
        if (correct === undefined) return []
        return [{ playerId: row.userId, correct }]
    })
}
