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

// Context the action needs but the engine state cannot supply.
export interface GiaiMaContext {
    actorId: string;                          // the MC, recorded on events
    roundId: string;                          // e.g. "giai-ma"
    // The rulebook's rules for this round, resolved from the match's config.
    rules: GiaiMaRules;
    hintTurnId: string;                       // the opened hint's turnId (resolved server-side)
    // The open hint's draft rows, read inside the transaction — resolveHint's
    // coverage check: every submitted answer must appear in the MC's verdicts.
    answerDrafts: AnswerDraft[];
    now: string;                              // ISO time, for opening a window
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
            // Coverage: every submitted answer must carry an explicit MC verdict —
            // no row may be silently skipped ("no auto verdict" is enforced here).
            // Both directions of the commit contract: a verdict for a non-submitter
            // → NO_ANSWER; a waiting draft without a verdict → UNJUDGED_ANSWERS.
            assertVerdictCoverage(ctx.answerDrafts, action.verdicts, "resolving the hint");
            const next = resolveOpenHint(
                state,
                Object.fromEntries(action.verdicts.map((v) => [v.playerId, v.correct]))
            );
            // The reveal judges each draft row in the same transaction: verdict +
            // final, points 0 (a correct hint lowers the keyword value; it never
            // scores match points itself). JudgeFact UPDATES the draft — it can
            // never invent an answer (NO_ANSWER if a row is missing).
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
            // The player's submission: lock participation + store the typed text as a
            // draft. NO verdict, NO points — the MC judges via judgeKeyword.
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
            // The MC's verdict on an existing draft. JudgeFact UPDATES the row the
            // submission created — it can never invent a submission (NO_ANSWER if
            // no draft row exists).
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
