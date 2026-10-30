import { GiaiMaOC4Player } from "./GiaiMaOC4Player"
import type { RoundModule } from "../types"

// Giải mã — the OC4 ruleset: hint windows + one typed keyword; the band is
// either the hint's answer box or the keyword box.
export const giaiMaOc4: RoundModule = {
    render: (ctx) => <GiaiMaOC4Player ctx={ctx} />,
}
