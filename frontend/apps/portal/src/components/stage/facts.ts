import type { ConsoleQuestion, LiveResponse, QuestionAnswerRow } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import type { CardData } from "./rail"

export interface ConsoleFacts {
    v: LiveResponse
    stage: string
    remaining: number | null
    rows: QuestionAnswerRow[]
    baseCards: CardData[]
    judgingId: string | null
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setSelectedPlayer: (userId: string) => void
    toggleSelect: (userId: string) => void
    commitHintReady: boolean
    commitKeywordReady: boolean
    commitHint: () => void
    commitKeyword: () => void
    setVerdict: (correct: boolean) => void
    send: (action: LiveAction) => void
    hetLuot: () => void
    backToLobby: () => void
    pickQuestion: () => void
    byId: (id: string) => ConsoleQuestion | null
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    watchRunning: boolean
    watchMs: number
    toggleWatch: () => void
    flash: string | null
    openRounds: () => void
    openAdjust: (userId: string) => void
}
