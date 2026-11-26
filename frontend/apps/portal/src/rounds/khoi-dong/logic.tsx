import type { ConsoleFacts } from "@/components/stage/deck"
import type { KhoiDongConsole } from "@/lib/live"
import { screenCore, type RoundAction, type RoundModule } from "@/rounds/types"
import { khoiDongRailVariantOf, khoiDongScreenOf } from "@shared/deck/khoi-dong"
import { KhoiDongChungAOCController, type KhoiDongChungCtx } from "./KhoiDongChungAOCController"
import { KhoiDongRiengAOCController, type KhoiDongRiengCtx } from "./KhoiDongRiengAOCController"


function riengCtx(f: ConsoleFacts): KhoiDongRiengCtx {
    return { ...screenCore(f), oralRemaining: f.oralRemaining }
}

function khoiDongConsole(f: ConsoleFacts): KhoiDongConsole | null {
    if (f.v.console?.roundId !== "khoi-dong") return null
    return f.v.console.console
}

function chungCtx(f: ConsoleFacts): KhoiDongChungCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        consoleKhoiDong: khoiDongConsole(f),
        target: f.target,
        setSelectedPlayer: f.setSelectedPlayer
    }
}

export const khoiDongAOC: RoundModule = {
    render: (f) => {
        if (khoiDongScreenOf(f.stage) === "khoi-dong-chung") return <KhoiDongChungAOCController ctx={chungCtx(f)} />
        return <KhoiDongRiengAOCController ctx={riengCtx(f)} />
    },
    railVariant: ({ stage }) => khoiDongRailVariantOf(stage),
    endRoundPlan: (input): RoundAction[] => {
        if (input.stage === "phase1") {
            if (input.hasOralRun) return [{ kind: "khoi-dong.timeOutRun" }]
            return []
        }
        return [{ kind: "khoi-dong.endRound" }]
    },
}
