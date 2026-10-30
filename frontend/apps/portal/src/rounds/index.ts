import { butPhaOc4 } from "./but-pha/logic"
import { giaiMaOc4 } from "./giai-ma/logic"
import { khoiDongOc4 } from "./khoi-dong/logic"
import { veDichOc4 } from "./ve-dich/logic"
import type { RoundAction, RoundModule, RoundPlanInput } from "./types"
export type { HetLuotFacts, RoundAction, RoundModule, RoundPlanInput, ScreenCore } from "./types"

// ── the controller's round registry ─────────────────────────────────────────
// One entry per RULESET (see types.ts): the live view's roundId picks the
// module, the module owns its screens/plans. A custom tournament registers its
// own round here — mix OC4 rounds with future variants freely.
//
// Deleting a module's folder and entry removes its rules from the console.

export const ROUNDS: Record<string, RoundModule> = {
    "khoi-dong": khoiDongOc4,
    "giai-ma": giaiMaOc4,
    "but-pha": butPhaOc4,
    "ve-dich": veDichOc4,
}

/** The round's module — null for a round this console has no rules for. */
export const roundModuleOf = (roundId: string): RoundModule | null => ROUNDS[roundId] ?? null

/**
 * Which rail the deck draws — the round's call. Unknown rounds follow the
 * khoi-dong rule (phase 2 answers, phase 1 compact); they never render today
 * (the lobby owns them), but the rule keeps the old behavior test-locked.
 */
export function railVariantOf(facts: { roundId: string; stage: string; veDichPhase: 1 | 2 | null }): "compact" | "answers" {
    return ROUNDS[facts.roundId]?.railVariant(facts)
        ?? (facts.stage === "phase2" ? "answers" : "compact")
}

/**
 * What Kết thúc sends: ONE press ends the round (the module plans finalize+end
 * as needed). Unknown rounds plan nothing — they never render a strip (the
 * lobby owns them).
 */
export function ketThucPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS[roundId]?.ketThucPlan(input) ?? []
}

/** What Tính giờ sends — the round's NEXT question (rounds with a cursor). */
export function nextQuestionPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS[roundId]?.nextQuestionPlan?.(input) ?? []
}
