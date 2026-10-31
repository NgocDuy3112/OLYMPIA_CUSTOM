import type { ConsoleFacts } from "@/components/stage/deck"
import type { VeDichMc } from "@/lib/live"
import { VeDichChungAOCController, type VeDichChungCtx } from "./VeDichChungAOCController"
import { VeDichPickAOCController, type VeDichPickCtx } from "./VeDichPickAOCController"
import { VeDichRiengAOCController, type VeDichRiengCtx } from "./VeDichRiengAOCController"
import { screenCore, type HetLuotFacts, type RoundAction, type RoundModule } from "../types"

// Về đích — the AOC ruleset: turn-based. Phase 1 each player picks the highest
// free cell (opens typed), phase 2 each picks three (oral + 5s buzz window).
// The board draws while nothing is open. The TURN is Hết lượt's job (resolve,
// verdicts first); Kết thúc ends the WHOLE round — the engine closes any open
// question with it, so it stays the ungated escape hatch.

/** The round's narrow slices — the screens' ctx types, projected from facts. */
function pickCtx(f: ConsoleFacts): VeDichPickCtx {
    return {
        ...screenCore(f),
        questions: f.v.questions,
        mcVeDich: (f.v.mc ?? null) as VeDichMc | null,
    }
}

function chungCtx(f: ConsoleFacts): VeDichChungCtx {
    return {
        ...screenCore(f),
        remaining: f.remaining,
        mcVeDich: (f.v.mc ?? null) as VeDichMc | null,
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

    const action: RoundAction = { kind: "ve-dich.resolve", answerer: facts.answererVerdict === "CORRECT" }
    if (facts.buzzerId !== null) action.buzzer = facts.buzzerVerdict === "CORRECT"
    return action
}

export const veDichAOC: RoundModule = {
    render: (f) => {
        if (f.v.projection.open.length === 0) return <VeDichPickAOCController ctx={pickCtx(f)} />
        return (f.v.mc as VeDichMc | null)?.phase === 2
            ? <VeDichRiengAOCController ctx={riengCtx(f)} />
            : <VeDichChungAOCController ctx={chungCtx(f)} />
    },
    railVariant: ({ veDichPhase }) => (veDichPhase === 2 ? "compact" : "answers"),
    ketThucPlan: (): RoundAction[] => [{ kind: "ve-dich.endRound" }],
    hetLuotAction,
}
