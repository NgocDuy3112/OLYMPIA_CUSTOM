import { basePointsForTime, speedMultiplier } from "../scoring/but-pha.js";
import { fail } from "./errors.js";
import { BUT_PHA_DEFAULTS, type ButPhaRules } from "../rules.js";

export interface Answer {
    playerId: string;
    correct: boolean;
    atS: number;            
}

export interface ButPhaState {
    rules: ButPhaRules;
    questionIds: string[];
    cursor: number;                                
    questionOpenedAt: string | null;               
    answers: Record<string, Answer[]>;             
    points: Record<string, Record<string, number>>; 
    ended: boolean;
    revealedAnswer?: string | null;
}

export function startButPha(questionIds: string[], rules: ButPhaRules = BUT_PHA_DEFAULTS): ButPhaState {
    if (questionIds.length !== rules.questionCount) {
        fail("VALIDATION", `but-pha needs exactly ${rules.questionCount} questions`);
    }
    return {
        rules, questionIds, cursor: 0, questionOpenedAt: null,
        answers: {}, points: {}, ended: false
    };
}

export function openCurrentQuestion(state: ButPhaState, openedAt: string): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    if (state.questionOpenedAt !== null) fail("QUESTION_OPEN", "the question is already open");
    return { ...state, questionOpenedAt: openedAt };
}

export function elapsedSeconds(state: ButPhaState, nowIso: string): number {
    if (state.questionOpenedAt === null) fail("QUESTION_NOT_OPEN", "no question is open");
    return (Date.parse(nowIso) - Date.parse(state.questionOpenedAt)) / 1000;
}

export function openQuestionId(state: ButPhaState): string | null {
    return state.ended ? null : state.questionIds[state.cursor];
}

export function submitAnswer(state: ButPhaState, answer: Answer): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    const qid = state.questionIds[state.cursor];

    const existing = state.answers[qid] ?? [];
    if (existing.some((a) => a.playerId === answer.playerId)) {
        fail("ALREADY_ANSWERED", "this player already answered this question");
    }

    const late = answer.atS > state.rules.questionLimitS || answer.atS < 0;
    const effective: Answer = late ? { ...answer, correct: false } : answer;

    const answers = { ...state.answers, [qid]: [...existing, effective] };

    let points = state.points;
    if (effective.correct) {
        const order = answers[qid].filter((a) => a.correct).length;
        const pts = basePointsForTime(effective.atS, state.rules.bands)
            * speedMultiplier(order, state.rules);
        points = {
            ...points,
            [qid]: { ...(points[qid] ?? {}), [effective.playerId]: pts }
        };
    }

    return { ...state, answers, points };
}

export function closeQuestion(state: ButPhaState): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    const cursor = state.cursor + 1;
    return {
        ...state,
        cursor,
        questionOpenedAt: null,
        ended: cursor >= state.rules.questionCount
    };
}

export interface FinalResult {
    playerId: string;
    correct: boolean;
    atS: number;
}

export function finalizeQuestion(state: ButPhaState, results: FinalResult[]): ButPhaState {
    if (state.ended) fail("ENDED", "but-pha is over");
    const qid = state.questionIds[state.cursor];
    if (state.answers[qid]) {
        fail("ALREADY_FINALIZED", `question ${qid} is already finalized`);
    }
    if (new Set(results.map((r) => r.playerId)).size !== results.length) {
        fail("VALIDATION", "a player may be finalized only once per question");
    }

    const ordered = [...results].sort((a, b) => a.atS - b.atS);
    const answers: Answer[] = [];
    const pointsFor: Record<string, number> = {};
    let correctSoFar = 0;

    for (const result of ordered) {
        const late = result.atS > state.rules.questionLimitS || result.atS < 0;
        const correct = result.correct && !late;
        if (correct) {
            correctSoFar += 1;
            pointsFor[result.playerId] = basePointsForTime(result.atS, state.rules.bands)
                * speedMultiplier(correctSoFar, state.rules);
        } else {
            pointsFor[result.playerId] = 0;
        }
        answers.push({ playerId: result.playerId, correct, atS: result.atS });
    }

    return {
        ...state,
        answers: { ...state.answers, [qid]: answers },
        points: { ...state.points, [qid]: pointsFor }
    };
}

export function endButPha(state: ButPhaState): ButPhaState {
    if (state.ended) return state;
    return { ...state, ended: true, questionOpenedAt: null };
}

export function butPhaTotal(state: ButPhaState, playerId: string): number {
    return Object.values(state.points).reduce(
        (sum, byPlayer) => sum + (byPlayer[playerId] ?? 0),
        0
    );
}
