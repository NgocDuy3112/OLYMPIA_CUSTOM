import type { ReactNode } from "react"
import type { ConsoleFacts } from "@/components/stage/deck"
import type { LiveAction } from "@/lib/live-actions"
import type { QuestionAnswerRow } from "@/lib/live"

export type RoundAction = LiveAction

export interface RoundPlanInput {
    stage: string
    hasOralRun: boolean
    openIds: string[]
    openQuestionPosition: number | null
    rows: QuestionAnswerRow[]
    overrides: Record<string, boolean>
}

export interface HetLuotFacts {
    answererVerdict: "CORRECT" | "INCORRECT" | null
    buzzerId: string | null
    buzzerVerdict: "CORRECT" | "INCORRECT" | null
}

export type ScreenCore = Pick<
    ConsoleFacts,
    "v" | "flash" | "baseCards" | "send" | "backToLobby" | "openRounds" | "openAdjust"
>

export function screenCore(facts: ConsoleFacts): ScreenCore {
    const { v, flash, baseCards, send, backToLobby, openRounds, openAdjust } = facts
    return { v, flash, baseCards, send, backToLobby, openRounds, openAdjust }
}

export interface RoundModule {
    render: (facts: ConsoleFacts) => ReactNode
    railVariant: (facts: { stage: string; veDichPhase: 1 | 2 | null }) => "compact" | "answers"
    endRoundPlan: (input: RoundPlanInput) => RoundAction[]
    nextQuestionPlan?: (input: RoundPlanInput) => RoundAction[]
    hetLuotAction?: (facts: HetLuotFacts) => RoundAction | null
}
