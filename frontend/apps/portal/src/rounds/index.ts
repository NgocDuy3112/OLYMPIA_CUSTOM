import { butPhaAOC } from "./but-pha/logic"
import { giaiMaAOC } from "./giai-ma/logic"
import { khoiDongAOC } from "./khoi-dong/logic"
import { veDichAOC } from "./ve-dich/logic"
import type { RoundAction, RoundModule, RoundPlanInput } from "./types"
export type { RoundModule } from "./types"

// ── the controller's round registry ─────────────────────────────────────────
// One entry per RULESET (see types.ts): the live view's roundId picks the
// module, the module owns its screens/plans. A custom tournament registers its
// own round here — mix AOC rounds with future variants freely.
//
// Deleting a module's folder and entry removes its rules from the console.

const ROUNDS: Record<string, RoundModule> = {
    "khoi-dong": khoiDongAOC,
    "giai-ma": giaiMaAOC,
    "but-pha": butPhaAOC,
    "ve-dich": veDichAOC,
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
 * What Về sảnh sends: ONE press ends the round (the module plans finalize+end
 * as needed). Unknown rounds plan nothing — they never render a strip (the
 * lobby owns them).
 */
export function endRoundPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS[roundId]?.endRoundPlan(input) ?? []
}

/** What Tính giờ sends — the round's NEXT question (rounds with a cursor). */
export function nextQuestionPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS[roundId]?.nextQuestionPlan?.(input) ?? []
}
