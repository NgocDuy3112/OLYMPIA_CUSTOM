import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@shared/lib/api"
import { logError } from "@shared/lib/log"
import { playSfx, stopSfx } from "@shared/lib/sfx"
import { useSocketStream } from "@shared/lib/ws"
import type { LiveAction, Verdict } from "./live-actions"
import type { TieBreakView } from "@/rounds/tiebreak/types"



export interface ConsoleQuestion {
    _id: string
    kind: "CHOICE" | "TEXT" | "KEYWORD"
    roundId: string
    turnId: string
    position: number
    questionText: string
    points: number
    payload: { options?: Array<{ id: string; text: string }>; [key: string]: unknown }
}

export interface SanitizedQuestion {
    questionId: string
    kind: string
    position: number
    questionText: string
    media: { url: string; type: string } | null
    payload: { options?: Array<{ id: string; text: string }> }
}

export interface Projection {
    matchId: string
    roundId: string
    version: number
    stage: string
    open: Array<{
        questionId: string
        deadlineAt: string | null
        frozenRemainingMs?: number | null
        question: SanitizedQuestion | null
    }>
    table: Array<{ id: string; displayName: string; points: number; rank: number }>
    oral?: {
        questionId: string
        question: SanitizedQuestion | null
        playerId: string | null
        index: number
        total: number
        elapsedS: number
        budgetS: number
        deadlineAt: string | null
    } | null
    board?: Array<{ questionId: string; value: number; where: "free" | "pending" | "open" | "taken" | "deferred" }>
    answers?: QuestionAnswerRow[]
    keywordDeadlineAt?: string | null
    keywordLength?: number
    keywordKind?: string
    keywordCode?: string | null
    hintAnswers: Record<string, string>
    tiebreak?: TieBreakView | null
    revealed?: {
        contestants: Array<{
            userId: string
            name: string
            answer: string | null
            verdict: "CORRECT" | "INCORRECT" | null
        }>
    }
    audioGate?: { allowed: string[] }
    mediaPolicy?: { mode: "all" | "countdown" | "assign"; turnPlayerId: string | null; answererId: string | null; assignedToId: string | null; buzzerId: string | null; allowed: string[] }
}

export interface GiaiMaConsole {
    hintsRemaining: string[]
    hintsPicked: string[]
    openHintId: string | null
    windowOpen: boolean
    keywordWindowOpen?: boolean
    hintsLocked?: boolean
    players: Array<{ id: string; keywordLocked: boolean; eliminated: boolean }>
}
export interface VeDichConsole {
    phase: 1 | 2
    turnPlayerId: string | null
    openStage: "current" | "buzz" | null
    revealed?: boolean
    clockStarted?: boolean
    answererId: string | null
    buzzerId: string | null
    buzzerMs: number | null
    power: "STAR" | "ASSIGN" | null
    assignedToId: string | null
    pendingQuestionId: string | null
    pendingValues?: number[]
    turnQuestions?: string[]
    turnValues?: number[]
    turnPicked?: number
    picksConfirmed?: boolean
    powersLeft?: Array<"STAR" | "ASSIGN">
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
    clockStarted?: boolean
}

export interface MatchController {
    id: string
    name: string
    active: boolean
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
    controller?: MatchController | null
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
        micOn?: boolean
        audioMuted?: boolean
        videoHidden?: boolean
        onToggleAudio?: () => void
        onToggleVideo?: () => void
        onToggleMic?: () => void
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
    questionId: string
    userId: string
    value: { picked?: string[]; text?: string; oral?: true } | null
    verdict: "CORRECT" | "INCORRECT" | null
    pointsAwarded: number | null
    answeredMs?: number | null
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
