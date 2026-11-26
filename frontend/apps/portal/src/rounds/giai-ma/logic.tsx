import type { ConsoleFacts } from "@/components/stage/deck"
import type { GiaiMaConsole } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule } from "@/rounds/types"
import { GiaiMaAOCController, type GiaiMaCtx } from "./GiaiMaAOCController"


function giaiMaConsole(f: ConsoleFacts): GiaiMaConsole | null {
    if (f.v.console?.roundId !== "giai-ma") return null
    return f.v.console.console
}

function giaiMaCtx(f: ConsoleFacts): GiaiMaCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        keywordRemaining: f.keywordRemaining,
        questions: f.v.questions,
        consoleGiaiMa: giaiMaConsole(f),
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
