import type { ConsoleFacts } from "@/components/stage/deck"
import { KhoiDongChungOC4Controller, type KhoiDongChungCtx } from "./KhoiDongChungOC4Controller"
import { KhoiDongRiengOC4Controller, type KhoiDongRiengCtx } from "./KhoiDongRiengOC4Controller"
import { screenCore, type RoundAction, type RoundModule } from "../types"

// Khởi động — the OC4 ruleset: phase 1 walks the oral runs one by one, phase 2
// is the shared typed batch against one deadline. Kết thúc ends the open run
// (or jumps to phase 2 when the walks are complete), or commits the staged
// verdicts and closes the batch.

function groupedOverrides(overrides: Record<string, boolean>): Array<{
    questionId: string
    verdicts: Array<{ playerId: string; correct: boolean }>
}> {
    const grouped = new Map<string, Array<{ playerId: string; correct: boolean }>>()
    for (const [key, correct] of Object.entries(overrides)) {
        const idx = key.indexOf(":")
        const questionId = key.slice(0, idx)
        const playerId = key.slice(idx + 1)
        if (!grouped.has(questionId)) grouped.set(questionId, [])
        grouped.get(questionId)!.push({ playerId, correct })
    }
    return [...grouped].map(([questionId, verdicts]) => ({ questionId, verdicts }))
}

/** The round's narrow slices — the screens' ctx types, projected from facts. */
function riengCtx(f: ConsoleFacts): KhoiDongRiengCtx {
    return { ...screenCore(f), watchRunning: f.watchRunning, watchMs: f.watchMs, toggleWatch: f.toggleWatch }
}

function chungCtx(f: ConsoleFacts): KhoiDongChungCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        judgingId: f.judgingId,
        target: f.target,
        setSelectedQ: f.setSelectedQ,
        setVerdict: f.setVerdict,
        setSelectedPlayer: f.setSelectedPlayer,
        byId: f.byId,
    }
}

export const khoiDongOc4: RoundModule = {
    render: (f) =>
        f.stage === "phase2"
            ? <KhoiDongChungOC4Controller ctx={chungCtx(f)} />
            : <KhoiDongRiengOC4Controller ctx={riengCtx(f)} />,
    railVariant: ({ stage }) => (stage === "phase2" ? "answers" : "compact"),
    ketThucPlan: (input): RoundAction[] => {
        if (input.stage === "phase1") {
            return [{ kind: input.hasOralRun ? "khoi-dong.timeOutRun" : "khoi-dong.beginPhase2" }]
        }
        // phase 2: commit the staged verdicts first, then close the window.
        const chain: RoundAction[] = []
        for (const { questionId, verdicts } of groupedOverrides(input.overrides)) {
            if (input.openIds.includes(questionId)) {
                chain.push({ kind: "khoi-dong.finalize", questionId, verdicts })
            }
        }
        chain.push({ kind: "khoi-dong.endRound" })
        return chain
    },
}
