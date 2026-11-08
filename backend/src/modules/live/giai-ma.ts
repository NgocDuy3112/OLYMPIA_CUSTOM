import type { GiaiMaState } from "../../game/engine/turns/giai-ma.js";
import {
    closeHintWindow,
    endGiaiMa,
    giaiMaPoints,
    judgeKeyword,
    lockKeyword,
    openHint,
    resolveOpenHint,
    startGiaiMa
} from "../../game/engine/turns/giai-ma.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { GiaiMaRules } from "../../game/engine/rules.js";
import type { GiaiMaAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import { assertVerdictCoverage, type AnswerDraft, type Transition } from "./apply.js";

export interface GiaiMaContext {
    actorId: string;                          
    roundId: string;                          
    rules: GiaiMaRules;
    hintTurnId: string;                       
    answerDrafts: AnswerDraft[];
    now: string;                              
}

export function applyGiaiMaAction(
    state: GiaiMaState,
    action: GiaiMaAction,
    ctx: GiaiMaContext
): Transition<GiaiMaState> {
    switch (action.kind) {
        case "giai-ma.start":
            return {
                state: startGiaiMa(action.playerIds, action.hintIds, ctx.rules),
                facts: []
            };

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

        case "giai-ma.resolveHint": {
            assertVerdictCoverage(ctx.answerDrafts, action.verdicts, "resolving the hint");
            const next = resolveOpenHint(
                state,
                Object.fromEntries(action.verdicts.map((v) => [v.playerId, v.correct]))
            );
            const facts: LiveFact[] = action.verdicts.map((v) => ({
                type: "judge",
                questionId: state.openHint!,
                userId: v.playerId,
                verdict: v.correct ? "CORRECT" : "INCORRECT",
                pointsAwarded: 0
            }));
            return { state: next, facts };
        }

        case "giai-ma.submitKeyword": {
            const next = lockKeyword(state, action.playerId);
            const facts: LiveFact[] = [{
                type: "draft",
                questionId: action.questionId,
                userId: action.playerId,
                value: { text: action.text },
                suggestion: action.suggestion
            }];
            return { state: next, facts };
        }

        case "giai-ma.judgeKeyword": {
            const next = judgeKeyword(state, action.playerId, action.correct);
            const facts: LiveFact[] = [{
                type: "judge",
                questionId: action.questionId,
                userId: action.playerId,
                verdict: action.correct ? "CORRECT" : "INCORRECT",
                pointsAwarded: giaiMaPoints(next, action.playerId)
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
