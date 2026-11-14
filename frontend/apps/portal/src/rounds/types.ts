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
    /** phase 1 grades player by player and advances the picked set */
    phase?: 1 | 2
    answererVerdict: "CORRECT" | "INCORRECT" | null
    buzzerId: string | null
    buzzerVerdict: "CORRECT" | "INCORRECT" | null
}

export type ScreenCore = Pick<
    ConsoleFacts,
    | "v"
    | "flash"
    | "baseCards"
    | "send"
    | "sendChain"
    | "backToLobby"
    | "openRounds"
    | "openAdjust"
    | "toggleSelect"
    | "selectedIds"
>

export function screenCore(facts: ConsoleFacts): ScreenCore {
    const {
        v, flash, baseCards, send, sendChain, backToLobby, openRounds, openAdjust,
        toggleSelect, selectedIds,
    } = facts
    return { v, flash, baseCards, send, sendChain, backToLobby, openRounds, openAdjust, toggleSelect, selectedIds }
}

export interface RoundModule {
    render: (facts: ConsoleFacts) => ReactNode
    railVariant: (facts: { stage: string; veDichPhase: 1 | 2 | null }) => "compact" | "answers"
    endRoundPlan: (input: RoundPlanInput) => RoundAction[]
    nextQuestionPlan?: (input: RoundPlanInput) => RoundAction[]
    hetLuotAction?: (facts: HetLuotFacts) => RoundAction | null
}
