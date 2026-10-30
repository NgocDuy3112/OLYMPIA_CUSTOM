import type { ConsoleFacts } from "@/components/stage/deck"
import { GiaiMaOC4Controller, type GiaiMaCtx } from "./GiaiMaOC4Controller"
import type { GiaiMaMc } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule } from "../types"

// Giải mã — the OC4 ruleset: hints open as timed windows, the keyword is
// typed once. Kết thúc closes the open hint window, else ends the round.
// Scoring is automatic (the engine) — Đúng on the strip only closes the window.

function giaiMaCtx(f: ConsoleFacts): GiaiMaCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        questions: f.v.questions,
        mcGiaiMa: (f.v.mc ?? null) as GiaiMaMc | null,
    }
}

export const giaiMaOc4: RoundModule = {
    render: (f) => <GiaiMaOC4Controller ctx={giaiMaCtx(f)} />,
    railVariant: () => "answers",
    ketThucPlan: (input): RoundAction[] =>
        input.openIds.length > 0
            ? [{ kind: "giai-ma.closeHintWindow" }]
            : [{ kind: "giai-ma.endRound" }],
}
