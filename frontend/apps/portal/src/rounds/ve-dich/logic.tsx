import type { ConsoleFacts } from "@/components/stage/deck"
import type { VeDichConsole } from "@/lib/live"
import { VeDichChungAOCController, type VeDichChungCtx } from "./VeDichChungAOCController"
import { VeDichPickAOCController, type VeDichPickCtx } from "./VeDichPickAOCController"
import { VeDichRiengAOCController, type VeDichRiengCtx } from "./VeDichRiengAOCController"
import { screenCore, type HetLuotFacts, type RoundAction, type RoundModule } from "../types"


function pickCtx(f: ConsoleFacts): VeDichPickCtx {
    return {
        ...screenCore(f),
        questions: f.v.questions,
        consoleVeDich: (f.v.console ?? null) as VeDichConsole | null,
        target: f.target,
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
    }
}

function riengCtx(f: ConsoleFacts): VeDichRiengCtx {
    return chungCtx(f)
}

export function hetLuotAction(facts: HetLuotFacts): RoundAction | null {
    if (facts.answererVerdict === null) return null
    if (facts.buzzerId !== null && facts.buzzerVerdict === null) return null

    return {
        kind: "ve-dich.resolve",
        answerer: facts.answererVerdict === "CORRECT",
        ...(facts.buzzerId !== null ? { buzzer: facts.buzzerVerdict === "CORRECT" } : {}),
    }
}

export const veDichAOC: RoundModule = {
    render: (f) => {
        if (f.v.projection.open.length === 0) return <VeDichPickAOCController ctx={pickCtx(f)} />
        return (f.v.console as VeDichConsole | null)?.phase === 2
            ? <VeDichRiengAOCController ctx={riengCtx(f)} />
            : <VeDichChungAOCController ctx={chungCtx(f)} />
    },
    railVariant: ({ veDichPhase }) => (veDichPhase === 2 ? "compact" : "answers"),
    endRoundPlan: (): RoundAction[] => [{ kind: "ve-dich.endRound" }],
    hetLuotAction,
}
