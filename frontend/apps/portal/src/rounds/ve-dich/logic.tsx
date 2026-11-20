import type { ConsoleFacts } from "@/components/stage/deck"
import type { VeDichConsole } from "@/lib/live"
import { VeDichChungAOCController, type VeDichChungCtx } from "./VeDichChungAOCController"
import { VeDichChungPickAOCController, type VeDichChungPickCtx } from "./VeDichChungPickAOCController"
import { VeDichRiengPickAOCController, type VeDichRiengPickCtx } from "./VeDichRiengPickAOCController"
import { VeDichRiengAOCController, type VeDichRiengCtx } from "./VeDichRiengAOCController"
import { screenCore, type HetLuotFacts, type RoundAction, type RoundModule } from "../types"


function pickCtx(f: ConsoleFacts): VeDichChungPickCtx & VeDichRiengPickCtx {
    return {
        ...screenCore(f),
        questions: f.v.questions,
        consoleVeDich: (f.v.console ?? null) as VeDichConsole | null,
        setSelectedPlayer: f.setSelectedPlayer,
    }
}

function chungCtx(f: ConsoleFacts): VeDichChungCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        consoleVeDich: (f.v.console ?? null) as VeDichConsole | null,
        target: f.target,
        setVerdict: f.setVerdict,
        setSelectedPlayer: f.setSelectedPlayer,
        verdictOf: f.verdictOf,
        hetLuot: f.hetLuot,
        rows: f.rows,
    }
}

function riengCtx(f: ConsoleFacts): VeDichRiengCtx {
    return chungCtx(f)
}

export function hetLuotAction(facts: HetLuotFacts): RoundAction | null {
    if (facts.phase === 1) return { kind: "ve-dich.closeQuestion" }

    if (facts.answererVerdict === null) return null
    if (facts.buzzerId !== null && facts.buzzerVerdict === null) return null

    const action = {
        kind: "ve-dich.resolve" as const,
        answerer: facts.answererVerdict === "CORRECT",
    }
    if (facts.buzzerId === null) return action
    return { ...action, buzzer: facts.buzzerVerdict === "CORRECT" }
}

export const veDichAOC: RoundModule = {
    render: (f) => {
        const pendingStaged = (f.v.projection.board ?? []).filter((c) => c.where === "pending").length > 0
        if (f.v.projection.open.length === 0) {
            const consoleView = f.v.console as VeDichConsole | null
            if (consoleView?.phase === 2) {
                if (consoleView.picksConfirmed) {
                    if (pendingStaged) return <VeDichRiengAOCController ctx={riengCtx(f)} />
                }
                return <VeDichRiengPickAOCController ctx={pickCtx(f)} />
            }
            if (pendingStaged) return <VeDichChungAOCController ctx={chungCtx(f)} />
            return <VeDichChungPickAOCController ctx={pickCtx(f)} />
        }
        const consoleView = f.v.console as VeDichConsole | null
        if (consoleView?.phase === 2) return <VeDichRiengAOCController ctx={riengCtx(f)} />
        return <VeDichChungAOCController ctx={chungCtx(f)} />
    },
    railVariant: ({ veDichPhase }) => {
        if (veDichPhase === 2) return "compact"
        return "answers"
    },
    endRoundPlan: (): RoundAction[] => [],
    hetLuotAction,
}
