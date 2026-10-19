import type { ButPhaState } from "../../game/engine/turns/but-pha.js";
import {
    closeQuestion,
    elapsedSeconds,
    endButPha,
    finalizeQuestion,
    openCurrentQuestion,
    openQuestionId,
    startButPha
} from "../../game/engine/turns/but-pha.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { ButPhaAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import type { AnswerDraft, Transition } from "./apply.js";

export interface ButPhaContext {
    actorId: string;
    roundId: string;
    now: string;              // ISO time, for the per-question clock
    questionIds: string[];    // the round's questions, resolved server-side at start
    answerDrafts: AnswerDraft[]; // the open question's drafts, read inside the transaction
}

export function applyButPhaAction(
    state: ButPhaState,
    action: ButPhaAction,
    ctx: ButPhaContext
): Transition<ButPhaState> {
    switch (action.kind) {
        case "but-pha.start":
            return { state: startButPha(ctx.questionIds), facts: [] };

        case "but-pha.openQuestion":
            return { state: openCurrentQuestion(state, ctx.now), facts: [] };

        case "but-pha.closeQuestion":
            return { state: closeQuestion(state), facts: [] };

        case "but-pha.endRound":
            return { state: endButPha(state), facts: [] };

        case "but-pha.finalize": {
            const questionId = openQuestionId(state);
            if (questionId === null) fail("ENDED", "but-pha is over");
            if (questionId !== action.questionId) {
                fail("INVALID_QUESTION", `question ${action.questionId} is not the open question`);
            }

            // The submission times come from the drafts, read inside the transaction.
            const times = new Map(ctx.answerDrafts.map((d) => [d.userId, d.answeredMs]));
            const results = action.verdicts.map((verdict) => {
                const answeredMs = times.get(verdict.playerId);
                if (answeredMs === null || answeredMs === undefined) {
                    fail("NO_ANSWER", `no submitted answer from ${verdict.playerId}`);
                }
                return { playerId: verdict.playerId, correct: verdict.correct, atS: answeredMs / 1000 };
            });

            const next = finalizeQuestion(state, results);

            // Read back what the engine recorded: a late answer is forced wrong.
            const recorded = new Map(next.answers[questionId].map((a) => [a.playerId, a.correct]));
            const facts: LiveFact[] = results.map((r) => ({
                type: "judge",
                questionId,
                userId: r.playerId,
                verdict: recorded.get(r.playerId) ? "CORRECT" : "INCORRECT",
                pointsAwarded: next.points[questionId]?.[r.playerId] ?? 0
            }));
            return { state: next, facts };
        }

        default: {
            const exhaustive: never = action;
            return fail("VALIDATION", `unhandled but-pha action ${JSON.stringify(exhaustive)}`);
        }
    }
}
