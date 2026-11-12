import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import { useSocketStream } from "@shared/lib/ws"
import type { LiveAction, Verdict } from "./live-actions"



export interface ConsoleQuestion {
    _id: string
    kind: "CHOICE" | "TEXT" | "KEYWORD" | "HINT"
    roundId: string
    turnId: string
    position: number
    questionText: string
    timeLimit: number | null
    points: number
    payload: { options?: Array<{ id: string; text: string }>; [key: string]: unknown }
}

export interface SanitizedQuestion {
    questionId: string
    kind: string
    position: number
    questionText: string
    media: { url: string; type: string } | null
    timeLimit: number | null
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
    board?: Array<{ questionId: string; value: number; where: "free" | "pending" | "open" | "taken" | "deferred" }>
    revealed?: { questionId: string; answer: string }
    audioGate?: { allowed: string[] }
}

export interface GiaiMaConsole {
    hintsRemaining: string[]
    hintsPicked: string[]
    openHintId: string | null
    players: Array<{ id: string; keywordLocked: boolean; eliminated: boolean }>
}
export interface VeDichConsole {
    phase: 1 | 2
    turnPlayerId: string | null
    openStage: "current" | "buzz" | null
    /** the controller clicked the card — players see the question from here */
    revealed?: boolean
    /** Tính giờ has been pressed for the open question */
    clockStarted?: boolean
    answererId: string | null
    buzzerId: string | null
    buzzerMs: number | null
    power: "STAR" | "ASSIGN" | null
    assignedToId: string | null
    pendingQuestionId: string | null
    stagedPower: { power: "STAR" | "ASSIGN"; targetId?: string } | null
    turnPowerUsed: boolean
}
export interface KhoiDongConsole {
    stage: "phase1" | "phase2"
    ended: boolean
    phase2Begun: boolean
    phase2Closed: boolean
    questionIndex: number
    questionCount: number
    windowOpen: boolean
}
export interface ButPhaConsole {
    questionId: string | null
    opened: boolean
    /** Tính giờ has been pressed for the revealed question */
    clockStarted?: boolean
}

export interface LiveResponse {
    version: number
    roundId: string
    state: Record<string, unknown>
    questions: ConsoleQuestion[]
    projection: Projection
    roundEnded: boolean
    connected?: string[]
    console: Record<string, unknown> | null
}


export interface LobbyData {
    title: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    roundId: string | null
    rounds: Array<{ id: string; name: string; status: "new" | "playing" | "ended"; phase?: 1 | 2 }>
    currentPhase?: 1 | 2 | null
    table: Array<{
        id: string
        displayName: string
        points: number
        rank: number
        video?: import("livekit-client").RemoteVideoTrack | null
    }>
    connected: string[]
}

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

export interface QuestionAnswerRow {
    userId: string
    value: { picked?: string[]; text?: string; oral?: true } | null
    verdict: "CORRECT" | "INCORRECT" | null
    judged: boolean
    pointsAwarded: number | null
}


const liveKey = (tournamentId: string, matchId: string) =>
    ["live", tournamentId, matchId] as const

interface ConsoleStreamFrame {
    v?: number
    type?: "console" | "error"
    at?: string
    data?: { view?: LiveResponse }
}

export function useLive(tournamentId: string, matchId: string, onFrame?: (at: string) => void) {
    const queryClient = useQueryClient()
    const query = useQuery({
        queryKey: liveKey(tournamentId, matchId),
        queryFn: () =>
            api<LiveResponse>(`/portal/tournaments/${tournamentId}/matches/${matchId}/live`),
        enabled: Boolean(tournamentId && matchId),
        refetchInterval: 3_000,
        staleTime: 0,
        retry: false,
    })

    useSocketStream(
        `/portal/tournaments/${tournamentId}/matches/${matchId}/live/stream`,
        Boolean(tournamentId && matchId),
        (message) => {
            const frame = message as ConsoleStreamFrame | null
            if (!frame || typeof frame !== "object") return

            if (frame.type === "console" && frame.data?.view) {
                if (frame.at) onFrame?.(frame.at)
                const incoming = frame.data.view
                queryClient.setQueryData<LiveResponse>(liveKey(tournamentId, matchId), (current) =>
                    current && current.version > incoming.version ? current : incoming
                )
                return
            }

            if (frame.type === "error") {
                void queryClient.invalidateQueries({ queryKey: liveKey(tournamentId, matchId) })
            }
        }
    )

    return query
}

export function useLiveAction(tournamentId: string, matchId: string) {
    const queryClient = useQueryClient()

    return useMutation({
        mutationFn: (input: { expectedVersion: number; action: LiveAction }) =>
            api<{ version?: number }>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`,
                { method: "POST", body: JSON.stringify(input) }
            ),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ["live"] })
            void queryClient.invalidateQueries({ queryKey: ["question-answers"] })
        },
        onError: () => {
            void queryClient.invalidateQueries({ queryKey: ["live"] })
        },
    })
}

export function useQuestionAnswers(tournamentId: string, matchId: string, questionId: string | null) {
    return useQuery({
        queryKey: ["question-answers", matchId, questionId],
        queryFn: () =>
            api<{ items: QuestionAnswerRow[] }>(
                `/portal/tournaments/${tournamentId}/matches/${matchId}/live/answers?questionId=${questionId}`
            ).then((body) => body.items),
        enabled: Boolean(questionId),
        refetchInterval: 3_000,
        retry: false,
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
        return correct === undefined ? [] : [{ playerId: row.userId, correct }]
    })
}
