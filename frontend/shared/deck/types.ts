// ── the player deck's wire contract ──────────────────────────────────────────
import type { RemoteVideoTrack } from "livekit-client"
// The PLAYER-facing shape of the live view (docs/live-surface.md § L3). This is
// the backend's contract, so it lives with the shared deck instead of inside
// either app — both apps' clients (portal player-live's PlayerView, gameplay's
// LiveView) are structurally identical to it, and the deck components only ever
// read THIS shape.

export interface PlayerQuestion {
    questionId: string
    kind: "MC" | "TEXT" | "KEYWORD" | "HINT"
    position: number
    questionText: string
    media: { url: string; type: "image" | "audio" | "video" } | null
    timeLimit: number | null
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

export type AnswerValue = { picked?: string[]; text?: string }

/**
 * The seven round screens' identities — ONE vocabulary for the whole deck.
 * Every coordinate table (strip slots, band rects) is keyed by it, and each
 * screen renders its own constant key (nothing derives a number anymore).
 */
export type LayoutKey =
    | "khoi-dong-rieng"
    | "khoi-dong-chung"
    | "giai-ma"
    | "but-pha"
    | "ve-dich-pick"
    | "ve-dich-chung"
    | "ve-dich-rieng"

export type VeDichCommand =
    | { type: "pick"; questionId: string }
    | { type: "pickBatch"; questionIds: string[] }
    | { type: "power"; power: "HOPE" | "SHIELD" }
    | { type: "buzz"; questionId: string }

/** The lobby read — what the waiting screen shows while the match isn't running. */
export interface LobbyData {
    title: string
    label: string
    status: "UPCOMING" | "LIVE" | "FINISHED"
    /** The round waiting to start (the live record's, else the match's first). */
    roundId: string | null
    /** The match's rounds in tournament order — the controller's open/start buttons.
     *  Khởi động & Về đích are PAIRED client-side (phase 1/2 → "· Riêng/· Chung"):
     *  two entries share the id, `phase` tells a fresh start which side to open. */
    rounds: Array<{ id: string; name: string; status: "new" | "playing" | "ended"; phase?: 1 | 2 }>
    /** The live stage's phase — which split entry is "where you are" (console-derived). */
    currentPhase?: 1 | 2 | null
    table: Array<{
        id: string
        displayName: string
        points: number
        rank: number
        /** The seat's live camera — the console enriches it from its Room
         *  (identity === row id); players fill their own from SelfBroadcast. */
        video?: RemoteVideoTrack | null
    }>
    /** User ids with a live socket right now — the lobby's connected dots. */
    connected: string[]
}
