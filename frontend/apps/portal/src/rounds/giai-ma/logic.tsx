import { GiaiMaOC4Controller } from "./GiaiMaOC4Controller"
import type { RoundAction, RoundModule } from "../types"

// Giải mã — the OC4 ruleset: hints open as timed windows, the keyword is
// typed once. Kết thúc closes the open hint window, else ends the round.
// Scoring is automatic (the engine) — Đúng on the strip only closes the window.
export const giaiMaOc4: RoundModule = {
    render: (ctx) => <GiaiMaOC4Controller ctx={ctx} />,
    railVariant: () => "answers",
    ketThucPlan: (input): RoundAction[] =>
        input.openIds.length > 0
            ? [{ kind: "giai-ma.closeHintWindow" }]
            : [{ kind: "giai-ma.endRound" }],
}
