import type { RoundModule } from "@/rounds/types"
import { TieBreakAOCPlayer } from "./TieBreakAOCPlayer"

export const tieBreakAOC: RoundModule = {
    render: (ctx) => <TieBreakAOCPlayer ctx={ctx} />,
}
