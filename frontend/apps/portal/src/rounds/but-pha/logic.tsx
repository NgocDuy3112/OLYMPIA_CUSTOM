import type { ConsoleFacts } from "@/components/stage/deck"
import { ButPhaOC4Controller, type ButPhaCtx } from "./ButPhaOC4Controller"
import { mergedVerdicts } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule } from "../types"

// Bứt phá — the OC4 ruleset: four typed questions, one open at a time, each
// against its own clock. Kết thúc finalizes the open question's ledger (once —
// the engine refuses a second finalize), then closes it; no open question
// ends the round.

function butPhaCtx(f: ConsoleFacts): ButPhaCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        roundEnded: f.roundEnded,
        bpDone: f.bpDone,
        target: f.target,
        setVerdict: f.setVerdict,
        setSelectedPlayer: f.setSelectedPlayer,
        byId: f.byId,
    }
}

export const butPhaOc4: RoundModule = {
    render: (f) => <ButPhaOC4Controller ctx={butPhaCtx(f)} />,
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
