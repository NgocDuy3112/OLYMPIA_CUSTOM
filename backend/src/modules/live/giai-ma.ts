import type { GiaiMaState } from "../../game/engine/turns/giai-ma.js";
import {
    closeHintWindow,
    endGiaiMa,
    giaiMaPoints,
    openHint,
    resolveOpenHint,
    startGiaiMa,
    submitKeyword
} from "../../game/engine/turns/giai-ma.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { GiaiMaAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import type { Transition } from "./apply.js";

// Context the action needs but the engine state cannot supply.
export interface GiaiMaContext {
    actorId: string;                          // the MC, recorded on events
    roundId: string;                          // e.g. "giai-ma"
    hintTurnId: string;                       // the opened hint's turnId (resolved server-side)
    submittedAnswers: Record<string, boolean>; // loaded from the answers ledger, for resolve
    now: string;                              // ISO time, for opening a window
    // Whether a keyword submission was auto-matched (player typed it) or asserted by the
    // MC. The route knows which surface the call came from.
    keywordAutoMatched: boolean;
}

export function applyGiaiMaAction(
    state: GiaiMaState,
    action: GiaiMaAction,
    ctx: GiaiMaContext
): Transition<GiaiMaState> {
    switch (action.kind) {
        case "giai-ma.start":
            return { state: startGiaiMa(action.playerIds, action.hintIds), facts: [] };

        case "giai-ma.openHint": {
            const next = openHint(state, action.hintId, ctx.now);
            const facts: LiveFact[] = [{
                type: "event",
                questionId: action.hintId,
                userId: ctx.actorId,
                roundId: ctx.roundId,
                kind: "PICK",
                payload: { kind: "PICK", turnId: ctx.hintTurnId, pickOrder: next.picked.length + 1 }
            }];
            return { state: next, facts };
        }

        case "giai-ma.closeHintWindow":
            return { state: closeHintWindow(state), facts: [] };

        case "giai-ma.resolveHint":
            // Uses the answers players submitted, not anything from the MC.
            return { state: resolveOpenHint(state, ctx.submittedAnswers), facts: [] };

        case "giai-ma.submitKeyword": {
            const next = submitKeyword(state, action.playerId, action.correct);
            const facts: LiveFact[] = [{
                type: "answer",
                questionId: action.questionId,
                userId: action.playerId,
                value: { text: action.text },
                verdict: action.correct ? "CORRECT" : "INCORRECT",
                pointsAwarded: giaiMaPoints(next, action.playerId),
                autoMatched: ctx.keywordAutoMatched
            }];
            return { state: next, facts };
        }

        case "giai-ma.endRound":
            return { state: endGiaiMa(state), facts: [] };

        default: {
            const exhaustive: never = action;
            return fail("VALIDATION", `unhandled giai-ma action ${JSON.stringify(exhaustive)}`);
        }
    }
}
