import { createRoundRegistry } from "@shared/rounds/registry"
import { butPhaAOC } from "./but-pha/logic"
import { giaiMaAOC } from "./giai-ma/logic"
import { khoiDongAOC } from "./khoi-dong/logic"
import { tieBreakAOC } from "./tiebreak/logic"
import { veDichAOC } from "./ve-dich/logic"
import type { RoundAction, RoundModule, RoundPlanInput } from "./types"
export type { RoundModule } from "./types"


const ROUNDS = createRoundRegistry<RoundModule>({
    "khoi-dong": khoiDongAOC,
    "giai-ma": giaiMaAOC,
    "but-pha": butPhaAOC,
    "ve-dich": veDichAOC,
})

export const tieBreakModule: RoundModule = tieBreakAOC

export const roundModuleOf = ROUNDS.of

export function railVariantOf(facts: { roundId: string; stage: string; veDichPhase: 1 | 2 | null }): "compact" | "answers" {
    const variant = ROUNDS.of(facts.roundId)?.railVariant(facts)
    if (variant) return variant
    if (facts.stage === "phase2") return "answers"
    return "compact"
}

export function endRoundPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS.of(roundId)?.endRoundPlan(input) ?? []
}

export function nextQuestionPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS.of(roundId)?.nextQuestionPlan?.(input) ?? []
}
