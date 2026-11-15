import type { ConsoleFacts } from "@/components/stage/deck"
import { GiaiMaAOCController, type GiaiMaCtx } from "./GiaiMaAOCController"
import type { GiaiMaConsole } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule } from "../types"


function giaiMaCtx(f: ConsoleFacts): GiaiMaCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        questions: f.v.questions,
        consoleGiaiMa: (f.v.console ?? null) as GiaiMaConsole | null,
        toggleSelect: f.toggleSelect,
        commitHintReady: f.commitHintReady,
        commitKeywordReady: f.commitKeywordReady,
        commitHint: f.commitHint,
        commitKeyword: f.commitKeyword,
    }
}

export const giaiMaAOC: RoundModule = {
    render: (f) => <GiaiMaAOCController ctx={giaiMaCtx(f)} />,
    railVariant: () => "answers",
    endRoundPlan: (input): RoundAction[] => {
        if (input.openIds.length > 0) return [{ kind: "giai-ma.closeHintWindow" }]
        return [{ kind: "giai-ma.endRound" }]
    },
}
