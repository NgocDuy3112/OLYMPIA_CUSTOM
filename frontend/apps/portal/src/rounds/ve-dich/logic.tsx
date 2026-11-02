import type { ConsoleFacts } from "@/components/stage/deck"
import type { VeDichConsole } from "@/lib/live"
import { VeDichChungAOCController, type VeDichChungCtx } from "./VeDichChungAOCController"
import { VeDichPickAOCController, type VeDichPickCtx } from "./VeDichPickAOCController"
import { VeDichRiengAOCController, type VeDichRiengCtx } from "./VeDichRiengAOCController"
import { screenCore, type HetLuotFacts, type RoundAction, type RoundModule } from "../types"

// Về đích — the AOC ruleset: turn-based. Phase 1 each player picks the highest
// free cell (opens typed), phase 2 each picks three (oral + 5s buzz window).
// The board draws while nothing is open. The TURN is Hết lượt's job (resolve,
// verdicts first); Về sảnh ends the WHOLE round — the engine closes any open
// question with it, so it stays the ungated escape hatch.

/** The round's narrow slices — the screens' ctx types, projected from facts. */
function pickCtx(f: ConsoleFacts): VeDichPickCtx {
    return {
        ...screenCore(f),
        questions: f.v.questions,
        consoleVeDich: (f.v.console ?? null) as VeDichConsole | null,
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

/**
 * The action that finishes the current TURN — resolve the open question with
 * its verdicts. Null while anything is unjudged (the button the screen
 * disables); the engine refuses a resolve without the buzzer verdict.
 */
export function hetLuotAction(facts: HetLuotFacts): RoundAction | null {
    if (facts.answererVerdict === null) return null
    if (facts.buzzerId !== null && facts.buzzerVerdict === null) return null

    // The buzzer's verdict rides along only when a buzzer exists — a plain
    // resolve carries no `buzzer` key (the engine reads its absence as such).
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
