import type { ConsoleFacts } from "@/components/stage/deck"
import { screenCore, type RoundModule } from "@/rounds/types"
import { TieBreakAOCController, type TieBreakCtx } from "./TieBreakAOCController"

function tieBreakCtx(f: ConsoleFacts): TieBreakCtx {
    return { ...screenCore(f) }
}

export const tieBreakAOC: RoundModule = {
    render: (f) => <TieBreakAOCController ctx={tieBreakCtx(f)} />,
    railVariant: () => "compact",
    endRoundPlan: () => [],
}
