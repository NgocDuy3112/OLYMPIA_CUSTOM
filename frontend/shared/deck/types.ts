import type { RemoteVideoTrack } from "livekit-client"
import type { ServerClock } from "@shared/lib/clock"

export interface PlayerQuestion {
    questionId: string
    kind: "CHOICE" | "TEXT" | "KEYWORD"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    payload: { options?: Array<{ id: string; text: string }>; codeLength?: number }
}

export interface PlayerScoreRow {
    id: string
    displayName: string
    points: number
    rank: number
}

export interface PlayerMe {
    verdicts?: Record<string, "CORRECT" | "INCORRECT">
    answerState?: "none" | "draft" | "final"
    mySubmission?: { answer: string; elapsedS: number } | null
    isMyRun?: boolean
    points?: number
    answered?: string[]
    finalized?: string[]
    windowOpen?: boolean
    questionIndex?: number
    questionCount?: number
    keywordLocked?: boolean
    eliminated?: boolean
    openTile?: number | null
    pickedTiles: number[]
    hintVerdicts: Record<string, string>
    keywordValue?: number | null
    revealedHints?: Array<{ questionId: string; question: PlayerQuestion | null }>
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
    buzzerMs?: number | null
}

export interface PlayerView {
    matchId: string
    roundId: string
    version: number
    stage: string
    open: Array<{
        questionId: string
        deadlineAt: string | null
        frozenRemainingMs?: number | null
        question: PlayerQuestion | null
    }>
    table: PlayerScoreRow[]
    oral?: {
        questionId: string
        question: PlayerQuestion | null
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
    turnPlayerId?: string | null
    answererId?: string | null
    assignedToId?: string | null
    stagedPower?: { power: "STAR" | "ASSIGN"; targetId?: string } | null
    keyword?: { questionId: string; question: PlayerQuestion | null } | null
    keywordCode?: string | null
    hintAnswers: Record<string, string>
    keywordDeadlineAt: string | null
    keywordLength: number
    keywordKind: string
    me: PlayerMe
    publicVerdicts?: Array<{
        questionId: string
        userId: string
        verdict: "CORRECT" | "INCORRECT"
        answeredMs?: number | null
    }>
    audioGate?: { allowed: string[] }
    revealed?: {
        contestants: Array<{
            userId: string
            name: string
            answer: string | null
            verdict: "CORRECT" | "INCORRECT" | null
            answeredMs?: number | null
        }>
    }
}

export type AnswerValue = { picked?: string[]; text?: string }

export type LayoutKey =
    | "khoi-dong-rieng"
    | "khoi-dong-chung"
    | "giai-ma"
    | "but-pha"
    | "ve-dich-pick"
    | "ve-dich-chung"
    | "ve-dich-rieng"

export type VeDichCommand =
    | { type: "buzz"; questionId: string }

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
        video?: RemoteVideoTrack | null
        micOn?: boolean
        audioMuted?: boolean
        videoHidden?: boolean
        onToggleAudio?: () => void
        onToggleVideo?: () => void
        onToggleMic?: () => void
    }>
    connected: string[]
}


export type PlayerCore = Pick<PlayerCtx, "v" | "stage" | "open" | "myId" | "flash" | "nameOf" | "audience">

export interface PlayerCtx {
    v: PlayerView
    stage: string
    open: PlayerView["open"]
    remaining: number
    oralRemaining: number
    clock: ServerClock
    myId: string | null
    audience?: boolean
    flash: string | null
    nameOf: (id: string) => string
    s2Q: PlayerView["open"][number] | undefined
    s2Idx: number
    pickS2: (questionId: string, idx: number) => void
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    keywordBusy: boolean
    submitKeyword: (questionId: string, text: string) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}
