import type { ConsoleQuestion, LiveResponse, QuestionAnswerRow } from "@/lib/live"
import type { LiveAction } from "@/lib/live-actions"
import type { CardData } from "./rail"

export interface ConsoleFacts {
    v: LiveResponse
    stage: string
    remaining: number | null
    keywordRemaining: number | null
    oralRemaining: number | null
    rows: QuestionAnswerRow[]
    baseCards: CardData[]
    judgingId: string | null
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setSelectedPlayer: (userId: string) => void
    toggleSelect: (userId: string) => void
    selectedIds: ReadonlySet<string>
    commitHintReady: boolean
    commitKeywordReady: boolean
    commitHint: () => void
    commitKeyword: () => void
    setVerdict: (correct: boolean) => void
    send: (action: LiveAction) => void
    sendChain: (actions: LiveAction[]) => void
    hetLuot: () => void
    backToLobby: () => void
    pickQuestion: () => void
    byId: (id: string) => ConsoleQuestion | null
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    flash: string | null
    openAdjust: (userId: string) => void
    openRegrade: (userId: string) => void
}
