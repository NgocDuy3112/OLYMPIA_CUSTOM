import type { SanitizedQuestion } from "./questions"

export type AnswerMode = "Oral" | "Buzz" | "Typed"

export type AnswerEligibility = "Everyone" | "CurrentTurn" | "Others" | "Pair"

export interface AnswerWindow {
    mode: AnswerMode
    eligibility: AnswerEligibility
    pairA?: string | null
    pairB?: string | null
    openedAt?: string | null
    seconds?: number | null
    closesAt?: string | null
    turnPlayerId?: string | null
    buzzer?: string | null
    buzzerMs?: number | null
    locked: boolean
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
    window: AnswerWindow
    windowOpen: boolean
    deadlineAt: string | null
    players: TieBreakPlayer[]
    me: TieBreakPlayer | null
    question: SanitizedQuestion | null
}
