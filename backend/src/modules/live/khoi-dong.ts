import type { KhoiDongState } from "../../game/engine/turns/khoi-dong-round.js";
import {
    activePlayerId,
    activeQuestionId,
    beginPhase2,
    openBuzz,
    nextQuestion,
    closeBuzzPhase,
    endKhoiDong,
    judgeBuzz,
    recordOral,
    startKhoiDong,
    timeOutRun
} from "../../game/engine/turns/khoi-dong-round.js";
import { khoiDongPoints } from "../../game/engine/scoring/khoi-dong.js";
import { KHOI_DONG_DEFAULTS, type KhoiDongRules } from "../../game/engine/rules.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { KhoiDongAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import type { Transition } from "./apply.js";

export interface KhoiDongContext {
    actorId: string;
    roundId: string;
    now: string;
    // The rulebook's rules for this round, resolved from the match's config.
    rules: KhoiDongRules;
    playerIds: string[];          // the match's competitors, resolved server-side
    phase1QuestionIds: string[];  // 6 oral questions
    phase2QuestionIds: string[];  // 6 typed questions
}

export function applyKhoiDongAction(
    state: KhoiDongState,
    action: KhoiDongAction,
    ctx: KhoiDongContext
): Transition<KhoiDongState> {
    switch (action.kind) {
        case "khoi-dong.start": {
            const started = startKhoiDong(ctx.playerIds, ctx.phase1QuestionIds);
            // phase: 2 — the navigator's "· Chung" entry: skip the untouched
            // oral phase and open the batch in the SAME action (atomic, one version).
            if (action.phase === 2) {
                return { state: beginPhase2(started, ctx.phase2QuestionIds), facts: [] };
            }
            return { state: started, facts: [] };
        }

        case "khoi-dong.recordOral": {
            const playerId = activePlayerId(state);
            const questionId = activeQuestionId(state);
            if (playerId === null || questionId === null) {
                fail("NO_ACTIVE_PLAYER", "no player is answering");
            }

            const next = recordOral(state, { correct: action.correct, spentS: action.spentS });

            // An answer that overran the 45 s budget is not counted and writes no fact.
            const recorded = next.runs[playerId].results[questionId];
            if (!recorded) return { state: next, facts: [] };

            const facts: LiveFact[] = [{
                type: "answer",
                questionId,
                userId: playerId,
                // oral: the answer was spoken, so there is no typed content
                value: { oral: true },
                verdict: recorded.correct ? "CORRECT" : "INCORRECT",
                pointsAwarded: recorded.points,
                autoMatched: false            // the MC judged it
            }];
            return { state: next, facts };
        }

        case "khoi-dong.timeOutRun":
            return { state: timeOutRun(state), facts: [] };

        case "khoi-dong.beginPhase2":
            return { state: beginPhase2(state, ctx.phase2QuestionIds), facts: [] };

        case "khoi-dong.openBuzz":
            return { state: openBuzz(state, ctx.now), facts: [] };

        case "khoi-dong.judgeBuzz": {
            // The verdict belongs to the FASTEST buzzer — read before judging.
            const current = state.phase2?.current ?? null;
            const buzzer = current?.buzzer ?? null;
            const questionId = current?.questionId ?? null;

            const next = judgeBuzz(state, action.correct);

            const facts: LiveFact[] = [];
            if (buzzer !== null && questionId !== null) {
                const points = state.phase2?.awards[buzzer] ?? 0;
                const after = next.phase2?.awards[buzzer] ?? 0;
                const awarded = after - points;            // 10, 5 or 0
                facts.push({
                    type: "answer",
                    questionId,
                    userId: buzzer,
                    value: { oral: true },                 // it was answered out loud
                    verdict: action.correct ? "CORRECT" : "INCORRECT",
                    pointsAwarded: awarded,
                    autoMatched: false                     // the MC judged it
                });
            }
            return { state: next, facts };
        }

        case "khoi-dong.nextQuestion":
            return { state: nextQuestion(state), facts: [] };

        case "khoi-dong.closePhase2":
            return { state: closeBuzzPhase(state), facts: [] };

        case "khoi-dong.endRound":
            return { state: endKhoiDong(state), facts: [] };

        default: {
            const exhaustive: never = action;
            return fail("VALIDATION", `unhandled khoi-dong action ${JSON.stringify(exhaustive)}`);
        }
    }
}
