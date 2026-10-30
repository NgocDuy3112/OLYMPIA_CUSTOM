import type { ReactNode } from "react"
import type { DeckCtx } from "@/components/stage/deck"
import type { QuestionAnswerRow } from "@/lib/live"

export type RoundAction = Record<string, unknown>

/** What a round's Kết thúc planner needs — the orchestrator gathers it. */
export interface RoundPlanInput {
    stage: string
    hasOralRun: boolean
    openIds: string[]
    rows: QuestionAnswerRow[]
    /** The MC's staged verdicts, keyed `${questionId}:${userId}`. */
    overrides: Record<string, boolean>
}

export interface HetLuotFacts {
    answererVerdict: "CORRECT" | "INCORRECT" | null
    buzzerId: string | null
    buzzerVerdict: "CORRECT" | "INCORRECT" | null
}

/**
 * A round as ONE pluggable module. The registry (`@/rounds`) maps the live
 * view's roundId to it — swapping a module swaps the RULES, so a custom
 * tournament can mix OC4 rounds with future variants (the OC4 suffix names
 * THIS ruleset). The controller side owns: which screen draws the round, which
 * rail it shows, what Kết thúc sends, and what Hết lượt sends.
 */
export interface RoundModule {
    /** Draw the round — returns elements (never a component made during render). */
    render: (ctx: DeckCtx) => ReactNode
    /** Which rail the round draws. */
    railVariant: (facts: { stage: string; veDichPhase: 1 | 2 | null }) => "compact" | "answers"
    /** The actions Kết thúc sends for the round (roundEnded → advance is global). */
    ketThucPlan: (input: RoundPlanInput) => RoundAction[]
    /** Turn-based rounds only: the action that finishes the current TURN. */
    hetLuotAction?: (facts: HetLuotFacts) => RoundAction | null
}
