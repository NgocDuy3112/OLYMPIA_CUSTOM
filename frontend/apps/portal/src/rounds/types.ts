import type { ReactNode } from "react"
import type { ConsoleFacts } from "@/components/stage/deck"
import type { QuestionAnswerRow } from "@/lib/live"

export type RoundAction = Record<string, unknown>

/** What a round's planners need — the orchestrator gathers it. */
export interface RoundPlanInput {
    stage: string
    hasOralRun: boolean
    openIds: string[]
    /** 1-based position of the open question (but-pha's cursor), null when none. */
    openQuestionPosition: number | null
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
 * The slice EVERY controller screen gets. A screen's ctx type is this plus
 * its round's extras — `ScreenCore & { remaining: number | null, … }` —
 * declared in the screen file and projected by the round's logic module.
 */
export type ScreenCore = Pick<
    ConsoleFacts,
    "v" | "flash" | "baseCards" | "send" | "ketThuc" | "openRounds" | "openAdjust"
>

/** The pass-through core: what every screen's ctx starts from. */
export function screenCore(facts: ConsoleFacts): ScreenCore {
    const { v, flash, baseCards, send, ketThuc, openRounds, openAdjust } = facts
    return { v, flash, baseCards, send, ketThuc, openRounds, openAdjust }
}

/**
 * A round as ONE pluggable module. The registry (`@/rounds`) maps the live
 * view's roundId to it — swapping a module swaps the RULES, so a custom
 * tournament can mix OC4 rounds with future variants (the OC4 suffix names
 * THIS ruleset). The controller side owns: which screen draws the round, which
 * rail it shows, what Kết thúc sends, and what Hết lượt sends.
 *
 * `render` receives the console's FACTS (what the orchestrator knows); the
 * module projects the narrow slice its screens need — screens never see the
 * wide object.
 */
export interface RoundModule {
    /** Draw the round — returns elements (never a component made during render). */
    render: (facts: ConsoleFacts) => ReactNode
    /** Which rail the round draws. */
    railVariant: (facts: { stage: string; veDichPhase: 1 | 2 | null }) => "compact" | "answers"
    /** The actions Kết thúc sends for the round — one press ends it. */
    ketThucPlan: (input: RoundPlanInput) => RoundAction[]
    /** Tính giờ's plan: the round's NEXT question (rounds with a question cursor). */
    nextQuestionPlan?: (input: RoundPlanInput) => RoundAction[]
    /** Turn-based rounds only: the action that finishes the current TURN. */
    hetLuotAction?: (facts: HetLuotFacts) => RoundAction | null
}
