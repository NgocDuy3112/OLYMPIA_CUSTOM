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
    // phase 1 is graded player by player — Hết lượt opens the next picked question
    if (facts.phase === 1) return { kind: "ve-dich.nextQuestion" }

    if (facts.answererVerdict === null) return null
    if (facts.buzzerId !== null && facts.buzzerVerdict === null) return null

    // phase 2 settles the question and lands back on the pick board, where the
    // turn's remaining questions wait behind Xác nhận
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
    // Về sảnh only navigates: ending the round here made it unresumable from
    // the waiting room, so the round stays "playing" until the match moves on
    endRoundPlan: (): RoundAction[] => [],
    hetLuotAction,
}
