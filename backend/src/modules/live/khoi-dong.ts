import type { KhoiDongState } from "../../game/engine/turns/khoi-dong-round.js";
import {
    activePlayerId,
    activeQuestionId,
    beginPhase2,
    endKhoiDong,
    judgeCard,
    nextQuestion,
    openWindow,
    phase2QuestionId,
    recordOral,
    startKhoiDong,
    timeOutRun
} from "../../game/engine/turns/khoi-dong-round.js";
import type { KhoiDongRules } from "../../game/engine/rules.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { KhoiDongAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import type { AnswerDraft, Transition } from "./apply.js";

export interface KhoiDongContext {
    actorId: string;
    roundId: string;
    now: string;
    // The rulebook's rules for this round, resolved from the match's config.
    rules: KhoiDongRules;
    playerIds: string[];          // the match's competitors, resolved server-side
    phase1QuestionIds: string[];  // 6 oral questions
    phase2QuestionIds: string[];  // 6 typed questions
    /**
     * The question in play's draft rows, read inside the transaction — the
     * judge's NO_ANSWER check and the advance's UNJUDGED_ANSWERS guard both
     * need what the ledger holds right now, not what it held a moment ago.
     */
    answerDrafts: AnswerDraft[];
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
                autoMatched: false            // the console judged it
            }];
            return { state: next, facts };
        }

        case "khoi-dong.timeOutRun":
            return { state: timeOutRun(state), facts: [] };

        case "khoi-dong.beginPhase2":
            return { state: beginPhase2(state, ctx.phase2QuestionIds), facts: [] };

        // Bấm giờ: from this click the field has `windowS` seconds to type.
        case "khoi-dong.startWindow":
            return { state: openWindow(state, ctx.now), facts: [] };

        // The console marks ONE card of the question in play — the rail's
        // selected player, Đúng or Sai. Re-marking is a correction: the engine
        // replaces this card's points instead of adding to them.
        case "khoi-dong.judge": {
            const questionId = state.phase2 === null ? null : phase2QuestionId(state.phase2);
            if (questionId === null) fail("PHASE_ENDED", "chung is over");

            const draft = ctx.answerDrafts.find((d) => d.userId === action.playerId);
            if (!draft) {
                fail("NO_ANSWER", `no submitted answer from ${action.playerId} to judge`);
            }

            const next = judgeCard(state, action.playerId, action.correct);
            const facts: LiveFact[] = [{
                type: "judge",
                questionId,
                userId: action.playerId,
                verdict: action.correct ? "CORRECT" : "INCORRECT",
                pointsAwarded: next.phase2?.results[questionId]?.[action.playerId] ?? 0
            }];
            return { state: next, facts };
        }

        // The next number on the progress strip. Every submitted card on the
        // question in play must carry a verdict first — the console marks them
        // one by one, THEN moves the cursor.
        case "khoi-dong.nextQuestion": {
            const questionId = state.phase2 === null ? null : phase2QuestionId(state.phase2);
            if (questionId !== null && ctx.answerDrafts.some((d) => !d.judged)) {
                fail("UNJUDGED_ANSWERS", "judge every submitted answer before moving to the next question");
            }
            return { state: nextQuestion(state), facts: [] };
        }

        case "khoi-dong.endRound":
            return { state: endKhoiDong(state), facts: [] };

        default: {
            const exhaustive: never = action;
            return fail("VALIDATION", `unhandled khoi-dong action ${JSON.stringify(exhaustive)}`);
        }
    }
}
