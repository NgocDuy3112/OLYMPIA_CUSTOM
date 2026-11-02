import type { ConsoleFacts } from "@/components/stage/deck"
import { KhoiDongChungAOCController, type KhoiDongChungCtx } from "./KhoiDongChungAOCController"
import { KhoiDongRiengAOCController, type KhoiDongRiengCtx } from "./KhoiDongRiengAOCController"
import { screenCore, type RoundAction, type RoundModule } from "../types"
import type { KhoiDongMc } from "@/lib/live"

// Khởi động — the AOC ruleset: phase 1 walks the oral runs one by one, phase 2
// is the shared typed batch against one deadline. Kết thúc ends the open run
// (or jumps to phase 2 when the walks are complete), or commits the staged
// verdicts and closes the batch.

/** The round's narrow slices — the screens' ctx types, projected from facts. */
function riengCtx(f: ConsoleFacts): KhoiDongRiengCtx {
    return { ...screenCore(f), watchRunning: f.watchRunning, watchMs: f.watchMs, toggleWatch: f.toggleWatch }
}

function chungCtx(f: ConsoleFacts): KhoiDongChungCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        mcKhoiDong: (f.v.mc ?? null) as KhoiDongMc | null
    }
}

export const khoiDongAOC: RoundModule = {
    render: (f) =>
        f.stage === "phase2"
            ? <KhoiDongChungAOCController ctx={chungCtx(f)} />
            : <KhoiDongRiengAOCController ctx={riengCtx(f)} />,
    railVariant: ({ stage }) => (stage === "phase2" ? "answers" : "compact"),
    endRoundPlan: (input): RoundAction[] => {
        if (input.stage === "phase1") {
            return [{ kind: input.hasOralRun ? "khoi-dong.timeOutRun" : "khoi-dong.beginPhase2" }]
        }
        // phase 2 is the buzz race: the only way to end it is to end the round.
        return [{ kind: "khoi-dong.endRound" }]
    },
}
