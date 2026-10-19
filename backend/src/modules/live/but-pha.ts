import type { ButPhaState } from "../../game/engine/turns/but-pha.js";
import {
    closeQuestion,
    elapsedSeconds,
    endButPha,
    openCurrentQuestion,
    openQuestionId,
    startButPha,
    submitAnswer
} from "../../game/engine/turns/but-pha.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { ButPhaAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import type { Transition } from "./apply.js";

export interface ButPhaContext {
    actorId: string;
    roundId: string;
    now: string;              // ISO time, for the per-question clock
    questionIds: string[];    // the round's questions, resolved server-side at start
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

        case "but-pha.submitAnswer": {
            const questionId = openQuestionId(state);
            if (questionId === null) fail("ENDED", "but-pha is over");

            // The server measures the time; a client never supplies it.
            const atS = elapsedSeconds(state, ctx.now);
            const next = submitAnswer(state, {
                playerId: action.playerId,
                correct: action.correct,
                atS
            });

            // Read back what was actually recorded: a late answer is forced wrong.
            const recorded = next.answers[questionId].find((a) => a.playerId === action.playerId)!;
            const pointsAwarded = next.points[questionId]?.[action.playerId] ?? 0;

            const facts: LiveFact[] = [{
                type: "answer",
                questionId,
                userId: action.playerId,
                value: { text: action.text },
                verdict: recorded.correct ? "CORRECT" : "INCORRECT",
                pointsAwarded,
                autoMatched: true
            }];
            return { state: next, facts };
        }

        default: {
            const exhaustive: never = action;
            return fail("VALIDATION", `unhandled but-pha action ${JSON.stringify(exhaustive)}`);
        }
    }
}
