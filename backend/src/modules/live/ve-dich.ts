import type { PlayerState, VeDichQuestion, VeDichState } from "../../game/engine/turns/ve-dich.js";
import {
    advanceTurn,
    beginPhase2,
    buzz,
    closeCurrentAnswer,
    createVeDich,
    declarePower,
    endVeDich,
    openPhase2Question,
    pickPhase1,
    pickPhase2,
    resolveQuestion,
    veDichPoints
} from "../../game/engine/turns/ve-dich.js";
import { fail } from "../../game/engine/turns/errors.js";
import type { VeDichAction } from "./actions.js";
import type { LiveFact } from "./facts.js";
import type { AnswerDraft, Transition } from "./apply.js";

export interface VeDichContext {
    actorId: string;
    roundId: string;
    now: string;
    // server-derived at start: the 24 questions, and each player's cumulative match score
    // (so "highest score picks first" means something — everyone starts ve-dich at zero)
    questions: VeDichQuestion[];
    players: Array<{ id: string; score: number }>;
    // read inside the transaction for resolve: did the answerer type an answer?
    drafts: AnswerDraft[];
}

function pickFact(
    questionId: string,
    userId: string,
    phase: 1 | 2,
    turnIndex: number,
    roundId: string
): LiveFact {
    return {
        type: "event",
        questionId,
        userId,
        roundId,
        kind: "PICK",
        payload: {
            kind: "PICK",
            turnId: phase === 1 ? "phase-1" : "phase-2",
            pickOrder: turnIndex + 1          // which turn the pick was made on
        }
    };
}

const verdictOf = (correct: boolean) => (correct ? "CORRECT" as const : "INCORRECT" as const);

export function applyVeDichAction(
    state: VeDichState,
    action: VeDichAction,
    ctx: VeDichContext
): Transition<VeDichState> {
    switch (action.kind) {
        case "ve-dich.start": {
            const players: PlayerState[] = ctx.players.map((p) => ({
                id: p.id,
                score: p.score,                    // cumulative, so phase 1 ordering is real
                powersLeft: ["HOPE", "SHIELD"]
            }));
            return { state: createVeDich(ctx.questions, players), facts: [] };
        }

        case "ve-dich.pick": {
            const before = state;
            const next = pickPhase1(state, action.playerId, action.questionId);
            return {
                state: next,
                facts: [pickFact(action.questionId, action.playerId, 1, before.turnIndex, ctx.roundId)]
            };
        }

        case "ve-dich.pickBatch": {
            const before = state;
            const next = pickPhase2(state, action.playerId, action.questionIds);
            return {
                state: next,
                facts: action.questionIds.map((q) =>
                    pickFact(q, action.playerId, 2, before.turnIndex, ctx.roundId))
            };
        }

        case "ve-dich.declarePower": {
            const questionId = state.open?.question.id;
            if (questionId === undefined) fail("NOTHING_OPEN", "no question is open");
            const next = declarePower(state, action.playerId, action.power);
            return {
                state: next,
                facts: [{
                    type: "event",
                    questionId,
                    userId: action.playerId,
                    roundId: ctx.roundId,
                    kind: "POWER",
                    payload: { kind: "POWER", power: action.power }
                }]
            };
        }

        case "ve-dich.openQuestion":
            return { state: openPhase2Question(state, action.questionId), facts: [] };

        case "ve-dich.closeCurrentAnswer":
            return { state: closeCurrentAnswer(state, ctx.now), facts: [] };

        case "ve-dich.buzz": {
            const questionId = state.open?.question.id;
            if (questionId === undefined) fail("NOTHING_OPEN", "no question is open");
            const buzzMs = state.buzzOpenedAt === null
                ? 0
                : Math.max(0, Date.parse(ctx.now) - Date.parse(state.buzzOpenedAt));

            const next = buzz(state, action.playerId);
            return {
                state: next,
                facts: [{
                    type: "event",
                    questionId,
                    userId: action.playerId,
                    roundId: ctx.roundId,
                    kind: "BUZZ",
                    payload: { kind: "BUZZ", buzzMs: Math.round(buzzMs), won: true }
                }]
            };
        }

        case "ve-dich.resolve": {
            const open = state.open;
            if (open === null) fail("NOTHING_OPEN", "no question is open");

            const face = open.question.value;
            const answererPoints = veDichPoints({
                faceValue: face,
                correct: action.answerer,
                power: open.power ?? undefined
            });

            const next = resolveQuestion(state, {
                answerer: action.answerer,
                ...(action.buzzer === undefined ? {} : { buzzer: action.buzzer })
            });

            const facts: LiveFact[] = [];
            const verdict = verdictOf(action.answerer);

            if (state.phase === 1) {
                // Typed: the player's draft is finalized. If they never submitted, the
                // verdict is still scored (and may be negative), so it needs its own row.
                const typed = ctx.drafts.some((d) => d.userId === open.answerer);
                facts.push(typed
                    ? { type: "judge", questionId: open.question.id, userId: open.answerer, verdict, pointsAwarded: answererPoints }
                    : { type: "answer", questionId: open.question.id, userId: open.answerer, value: { oral: true }, verdict, pointsAwarded: answererPoints, autoMatched: false });
            } else {
                // Oral: the controller recorded both verdicts directly.
                facts.push({ type: "answer", questionId: open.question.id, userId: open.answerer, value: { oral: true }, verdict, pointsAwarded: answererPoints, autoMatched: false });

                if (open.buzzer !== null) {
                    const buzzerCorrect = action.buzzer === true;
                    facts.push({
                        type: "answer",
                        questionId: open.question.id,
                        userId: open.buzzer,
                        value: { oral: true },
                        verdict: verdictOf(buzzerCorrect),
                        pointsAwarded: veDichPoints({ faceValue: face, correct: buzzerCorrect }),
                        autoMatched: false
                    });
                }
            }

            return { state: next, facts };
        }

        case "ve-dich.advanceTurn":
            return { state: advanceTurn(state), facts: [] };

        case "ve-dich.beginPhase2":
            return { state: beginPhase2(state), facts: [] };

        case "ve-dich.endRound":
            return { state: endVeDich(state), facts: [] };

        default: {
            const exhaustive: never = action;
            return fail("VALIDATION", `unhandled ve-dich action ${JSON.stringify(exhaustive)}`);
        }
    }
}
