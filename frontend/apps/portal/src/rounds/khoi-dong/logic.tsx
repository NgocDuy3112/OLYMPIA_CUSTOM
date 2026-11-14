import type { ConsoleFacts } from "@/components/stage/deck"
import { KhoiDongChungAOCController, type KhoiDongChungCtx } from "./KhoiDongChungAOCController"
import { KhoiDongRiengAOCController, type KhoiDongRiengCtx } from "./KhoiDongRiengAOCController"
import { screenCore, type RoundAction, type RoundModule } from "../types"
import type { KhoiDongConsole } from "@/lib/live"


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
        // the waiting room owns the phase change now — Về sảnh only wraps up
        if (input.stage === "phase1") {
            return input.hasOralRun ? [{ kind: "khoi-dong.timeOutRun" }] : []
        }
        return [{ kind: "khoi-dong.endRound" }]
    },
}
