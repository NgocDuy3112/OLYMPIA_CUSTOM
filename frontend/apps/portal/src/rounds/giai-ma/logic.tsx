import type { ConsoleFacts } from "@/components/stage/deck"
import { GiaiMaAOCController, type GiaiMaCtx } from "./GiaiMaAOCController"
import type { GiaiMaMc } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule } from "../types"

// Giải mã — the AOC ruleset: hints open as timed windows, the keyword is
// typed once. Kết thúc closes the open hint window, else ends the round.
// NOTHING is auto-scored: the MC clicks the players who are CORRECT (multi-
// select) and commits — Đúng resolves the open hint with explicit verdicts,
// Đúng từ khoá judges the keyword drafts (selected = correct, rest = wrong).

function giaiMaCtx(f: ConsoleFacts): GiaiMaCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        questions: f.v.questions,
        mcGiaiMa: (f.v.mc ?? null) as GiaiMaMc | null,
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
    ketThucPlan: (input): RoundAction[] =>
        input.openIds.length > 0
            ? [{ kind: "giai-ma.closeHintWindow" }]
            : [{ kind: "giai-ma.endRound" }],
}
