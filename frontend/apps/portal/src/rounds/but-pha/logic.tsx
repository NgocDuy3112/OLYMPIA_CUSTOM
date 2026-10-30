import { mergedVerdicts } from "@/lib/live"
import { ButPhaOC4Controller } from "./ButPhaOC4Controller"
import type { RoundAction, RoundModule } from "../types"

// Bứt phá — the OC4 ruleset: four typed questions, one open at a time, each
// against its own clock. Kết thúc finalizes the open question's ledger (once —
// the engine refuses a second finalize), then closes it; no open question
// ends the round.
export const butPhaOc4: RoundModule = {
    render: (ctx) => <ButPhaOC4Controller ctx={ctx} />,
    railVariant: () => "answers",
    ketThucPlan: (input): RoundAction[] => {
        if (input.openIds.length === 0) return [{ kind: "but-pha.endRound" }]
        const questionId = input.openIds[0]
        const chain: RoundAction[] = []
        if (input.rows.length > 0 && input.rows.some((row) => !row.judged)) {
            chain.push({
                kind: "but-pha.finalize",
                questionId,
                verdicts: mergedVerdicts(questionId, input.rows, input.overrides),
            })
        }
        chain.push({ kind: "but-pha.closeQuestion" })
        return chain
    },
}
