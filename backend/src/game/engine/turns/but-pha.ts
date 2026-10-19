// but-pha: 4 sequential questions, 30 s each, typed. Pure state transitions.
import { basePointsForTime, speedMultiplier } from "../scoring/but-pha.js";
import { fail } from "./errors.js";

export const QUESTION_COUNT = 4;
export const QUESTION_LIMIT_S = 30;

export interface Answer {
    playerId: string;
    correct: boolean;
    atS: number;            // seconds from question open
}

export interface ButPhaState {
    questionIds: string[];
    cursor: number;                                // which question is open
    questionOpenedAt: string | null;               // ISO time the current question opened
    answers: Record<string, Answer[]>;             // questionId → answers in arrival order
    points: Record<string, Record<string, number>>; // questionId → playerId → points
    ended: boolean;
}

export function startButPha(questionIds: string[]): ButPhaState {
    if (questionIds.length !== QUESTION_COUNT) {
        fail("VALIDATION", `but-pha needs exactly ${QUESTION_COUNT} questions`);
    }
    return { questionIds, cursor: 0, questionOpenedAt: null, answers: {}, points: {}, ended: false };
}

// The MC starts the clock for the current question.
export function openCurrentQuestion(state: ButPhaState, openedAt: string): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    if (state.questionOpenedAt !== null) fail("QUESTION_OPEN", "the question is already open");
    return { ...state, questionOpenedAt: openedAt };
}

// Seconds since the current question opened. Throws if the clock has not started.
export function elapsedSeconds(state: ButPhaState, nowIso: string): number {
    if (state.questionOpenedAt === null) fail("QUESTION_NOT_OPEN", "no question is open");
    return (Date.parse(nowIso) - Date.parse(state.questionOpenedAt)) / 1000;
}

export function openQuestionId(state: ButPhaState): string | null {
    return state.ended ? null : state.questionIds[state.cursor];
}

// Record one answer for the open question. Rules:
// - rejected after 30 s (scores 0, takes no speed order); exactly 30 s is in time
// - the player may answer only once per question
// - speed order counts correct answers only, in arrival order
export function submitAnswer(state: ButPhaState, answer: Answer): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    const qid = state.questionIds[state.cursor];

    const existing = state.answers[qid] ?? [];
    if (existing.some((a) => a.playerId === answer.playerId)) {
        fail("ALREADY_ANSWERED", "this player already answered this question");
    }

    // Late: recorded as wrong, no speed order, no points.
    const late = answer.atS > QUESTION_LIMIT_S || answer.atS < 0;
    const effective: Answer = late ? { ...answer, correct: false } : answer;

    const answers = { ...state.answers, [qid]: [...existing, effective] };

    let points = state.points;
    if (effective.correct) {
        const order = answers[qid].filter((a) => a.correct).length;
        const pts = basePointsForTime(effective.atS) * speedMultiplier(order);
        points = {
            ...points,
            [qid]: { ...(points[qid] ?? {}), [effective.playerId]: pts }
        };
    }

    return { ...state, answers, points };
}

// Close the open question and move to the next one, or end the round.
export function closeQuestion(state: ButPhaState): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    const cursor = state.cursor + 1;
    return { ...state, cursor, questionOpenedAt: null, ended: cursor >= QUESTION_COUNT };
}

// The MC ends the round early.
export function endButPha(state: ButPhaState): ButPhaState {
    if (state.ended) return state;
    return { ...state, ended: true, questionOpenedAt: null };
}

// Total for one player across the round.
export function butPhaTotal(state: ButPhaState, playerId: string): number {
    return Object.values(state.points).reduce(
        (sum, byPlayer) => sum + (byPlayer[playerId] ?? 0),
        0
    );
}
