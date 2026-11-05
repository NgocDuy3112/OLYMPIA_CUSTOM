import type { ConsoleFacts } from "@/components/stage/deck"
import { KhoiDongChungAOCController, type KhoiDongChungCtx } from "./KhoiDongChungAOCController"
import { KhoiDongRiengAOCController, type KhoiDongRiengCtx } from "./KhoiDongRiengAOCController"
import { screenCore, type RoundAction, type RoundModule } from "../types"
import type { KhoiDongConsole } from "@/lib/live"

// Khởi động — the AOC ruleset: phase 1 walks the oral runs one by one; phase 2
// is the six-question TIMED BATCH — Bấm giờ opens the window, the console marks
// each card, the next number moves on. Kết thúc ends the open run (or jumps to
// phase 2 when the walks are complete), or closes the batch.

/** The round's narrow slices — the screens' ctx types, projected from facts. */
function riengCtx(f: ConsoleFacts): KhoiDongRiengCtx {
    return { ...screenCore(f), watchRunning: f.watchRunning, watchMs: f.watchMs, toggleWatch: f.toggleWatch }
}

function chungCtx(f: ConsoleFacts): KhoiDongChungCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        consoleKhoiDong: (f.v.console ?? null) as KhoiDongConsole | null,
        target: f.target,
        setSelectedPlayer: f.setSelectedPlayer
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
        // phase 2 is the batch: the strip walks its six, then the round ends.
        return [{ kind: "khoi-dong.endRound" }]
    },
}
