import type { RemoteVideoTrack } from "livekit-client"
import type { ServerClock } from "@shared/lib/clock"
import type { Lobby, LobbyRound, LobbySeat } from "@shared/wire/lobby"
import type { AnswerValue, PlayerView } from "@shared/wire/live"

export type {
    AnswerValue,
    PlayerMe,
    PlayerQuestion,
    PlayerScoreRow,
    PlayerView,
} from "@shared/wire/live"

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

export interface LobbySeatView extends LobbySeat {
    video?: RemoteVideoTrack | null
    micOn?: boolean
    audioMuted?: boolean
    videoHidden?: boolean
    onToggleAudio?: () => void
    onToggleVideo?: () => void
    onToggleMic?: () => void
}

export interface LobbyData extends Omit<Lobby, "rounds" | "table"> {
    rounds: Array<LobbyRound & { phase?: 1 | 2 }>
    currentPhase?: 1 | 2 | null
    table: LobbySeatView[]
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
