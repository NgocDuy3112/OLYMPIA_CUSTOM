import { butPhaAOC } from "./but-pha/logic"
import { giaiMaAOC } from "./giai-ma/logic"
import { khoiDongAOC } from "./khoi-dong/logic"
import { veDichAOC } from "./ve-dich/logic"
import type { RoundAction, RoundModule, RoundPlanInput } from "./types"
export type { RoundModule } from "./types"


const ROUNDS: Record<string, RoundModule> = {
    "khoi-dong": khoiDongAOC,
    "giai-ma": giaiMaAOC,
    "but-pha": butPhaAOC,
    "ve-dich": veDichAOC,
}

export const roundModuleOf = (roundId: string): RoundModule | null => ROUNDS[roundId] ?? null

export function railVariantOf(facts: { roundId: string; stage: string; veDichPhase: 1 | 2 | null }): "compact" | "answers" {
    return ROUNDS[facts.roundId]?.railVariant(facts)
        ?? (facts.stage === "phase2" ? "answers" : "compact")
}

export function endRoundPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS[roundId]?.endRoundPlan(input) ?? []
}

export function nextQuestionPlanOf(roundId: string, input: RoundPlanInput): RoundAction[] {
    return ROUNDS[roundId]?.nextQuestionPlan?.(input) ?? []
}
