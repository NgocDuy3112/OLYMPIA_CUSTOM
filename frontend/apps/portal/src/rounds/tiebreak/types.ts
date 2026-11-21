export interface TieBreakMedia {
    url: string
    type: string
}

export interface TieBreakQuestionPayload {
    options?: Array<{ id: string; text: string }>
}

export interface TieBreakQuestion {
    questionId: string
    kind: string
    position: number
    questionText: string
    media: TieBreakMedia | null
    payload: TieBreakQuestionPayload
}

export interface TieBreakPlayer {
    id: string
    displayName: string
    points: number
    rank: number
    eliminated: boolean
}

export interface TieBreakWindow {
    mode: string
    eligibility: string
    pairA: string | null
    pairB: string | null
    openedAt: string | null
    seconds: number | null
    closesAt: string | null
    turnPlayerId: string | null
    buzzer: string | null
    buzzerMs: number | null
    locked: boolean
}

export interface TieBreakView {
    matchId: string
    version: number
    stage: string
    questionId: string | null
    cursor: number
    ended: boolean
    window: TieBreakWindow
    windowOpen: boolean
    deadlineAt: string | null
    players: TieBreakPlayer[]
    me: TieBreakPlayer | null
    question: TieBreakQuestion | null
}

export type TieBreakPostAction =
    | "start"
    | "open-buzz"
    | "lock-buzz"
    | "judge"
    | "advance"
    | "end"

export interface TieBreakPostBody {
    action: TieBreakPostAction
    playerIds?: string[]
    correct?: boolean
    expectedVersion: number
}
