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
    render: (f) => {
        if (f.stage === "phase2") return <KhoiDongChungAOCController ctx={chungCtx(f)} />
        return <KhoiDongRiengAOCController ctx={riengCtx(f)} />
    },
    railVariant: ({ stage }) => {
        if (stage === "phase2") return "answers"
        return "compact"
    },
    endRoundPlan: (input): RoundAction[] => {
        if (input.stage === "phase1") {
            if (input.hasOralRun) return [{ kind: "khoi-dong.timeOutRun" }]
            return []
        }
        return [{ kind: "khoi-dong.endRound" }]
    },
}
