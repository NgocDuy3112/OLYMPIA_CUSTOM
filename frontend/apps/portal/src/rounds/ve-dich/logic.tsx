import { VeDichChungOC4Controller } from "./VeDichChungOC4Controller"
import { VeDichPickOC4Controller } from "./VeDichPickOC4Controller"
import { VeDichRiengOC4Controller } from "./VeDichRiengOC4Controller"
import type { HetLuotFacts, RoundAction, RoundModule } from "../types"

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

// Về đích — the OC4 ruleset: turn-based. Phase 1 each player picks the highest
// free cell (opens typed), phase 2 each picks three (oral + 5s buzz window).
// The board draws while nothing is open. The TURN is Hết lượt's job (resolve,
// verdicts first); Kết thúc ends the WHOLE round — the engine closes any open
// question with it, so it stays the ungated escape hatch.
export const veDichOc4: RoundModule = {
    render: (ctx) => {
        if (ctx.v.projection.open.length === 0) return <VeDichPickOC4Controller ctx={ctx} />
        return ctx.mcVeDich?.phase === 2
            ? <VeDichRiengOC4Controller ctx={ctx} />
            : <VeDichChungOC4Controller ctx={ctx} />
    },
    railVariant: ({ veDichPhase }) => (veDichPhase === 2 ? "compact" : "answers"),
    ketThucPlan: (): RoundAction[] => [{ kind: "ve-dich.endRound" }],
    hetLuotAction,
}
