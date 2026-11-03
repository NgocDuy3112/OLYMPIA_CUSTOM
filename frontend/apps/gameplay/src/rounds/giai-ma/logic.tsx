import { GiaiMaAOCPlayer } from "@shared/deck/screens/GiaiMaAOCPlayer"
import type { RoundModule } from "../types"

// Giải mã — the AOC ruleset: hint windows + one typed keyword; the band is
// either the hint's answer box or the keyword box.
export const giaiMaAOC: RoundModule = {
    render: (ctx) => <GiaiMaAOCPlayer ctx={ctx} />,
}
