// khoi-dong: two phases, each with its own clock. Pure state transitions.
import { KHOI_DONG_POINTS } from "../scoring/khoi-dong.js";
import { fail } from "./errors.js";

export const PHASE1_QUESTIONS = 6;
export const PHASE1_BUDGET_S = 45;
export const PHASE2_QUESTIONS = 6;
export const PHASE2_BUDGET_S = 60;

// ─── Phase 1: oral, sequential, one shared 45 s clock ─────────────────────────

export interface Phase1State {
    kind: "phase1";
    questionIds: string[];       // 6 questions, in order
    cursor: number;              // index of the question being asked
    elapsedS: number;            // time used so far
    results: Record<string, { correct: boolean; points: number }>;
    ended: boolean;              // true once all asked, or the budget ran out
}

export function startPhase1(questionIds: string[]): Phase1State {
    if (questionIds.length !== PHASE1_QUESTIONS) {
        fail("VALIDATION", `phase 1 needs exactly ${PHASE1_QUESTIONS} questions`);
    }
    return { kind: "phase1", questionIds, cursor: 0, elapsedS: 0, results: {}, ended: false };
}

// The judge records the oral answer; the clock is charged the time spent.
export function answerPhase1(
    state: Phase1State,
    params: { correct: boolean; spentS: number }
): Phase1State {
    if (state.ended) fail("PHASE_ENDED", "phase 1 is over");
    const elapsedS = state.elapsedS + params.spentS;
    const id = state.questionIds[state.cursor];

    // Budget exhausted mid-answer: the answer is not counted.
    if (elapsedS > PHASE1_BUDGET_S) {
        return { ...state, elapsedS: PHASE1_BUDGET_S, ended: true };
    }

    const cursor = state.cursor + 1;
    return {
        ...state,
        elapsedS,
        cursor,
        results: {
            ...state.results,
            [id]: {
                correct: params.correct,
                points: params.correct ? KHOI_DONG_POINTS : 0
            }
        },
        ended: cursor >= PHASE1_QUESTIONS
    };
}

// The clock ran out between questions: the phase ends, unanswered questions score 0.
export function timeOutPhase1(state: Phase1State): Phase1State {
    if (state.ended) return state;
    return { ...state, elapsedS: PHASE1_BUDGET_S, ended: true };
}

export function phase1Total(state: Phase1State): number {
    return Object.values(state.results).reduce((sum, r) => sum + r.points, 0);
}

// ─── Phase 2: typed, simultaneous, one shared 60 s clock ──────────────────────

export interface Phase2State {
    kind: "phase2";
    questionIds: string[];                  // 6 questions, all visible at once
    elapsedS: number;
    answers: Record<string, Record<string, boolean>>; // playerId → questionId → correct
    closed: boolean;
}

export function startPhase2(questionIds: string[]): Phase2State {
    if (questionIds.length !== PHASE2_QUESTIONS) {
        fail("VALIDATION", `phase 2 needs exactly ${PHASE2_QUESTIONS} questions`);
    }
    return { kind: "phase2", questionIds, elapsedS: 0, answers: {}, closed: false };
}

// Typed answers are submitted during the 60 s; anything after the clock is rejected.
export function submitPhase2(
    state: Phase2State,
    params: { playerId: string; questionId: string; correct: boolean; atS: number }
): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "phase 2 is over");
    if (!state.questionIds.includes(params.questionId)) {
        fail("INVALID_QUESTION", `question ${params.questionId} is not in phase 2`);
    }
    if (params.atS > PHASE2_BUDGET_S) {
        fail("LATE", "answer arrived after the 60 s budget");
    }
    const mine = state.answers[params.playerId] ?? {};
    if (params.questionId in mine) fail("ALREADY_ANSWERED", "already answered this question");

    return {
        ...state,
        elapsedS: Math.max(state.elapsedS, params.atS),
        answers: {
            ...state.answers,
            [params.playerId]: { ...mine, [params.questionId]: params.correct }
        }
    };
}

export function closePhase2(state: Phase2State): Phase2State {
    return { ...state, closed: true, elapsedS: PHASE2_BUDGET_S };
}

export function phase2Points(state: Phase2State, playerId: string): number {
    const mine = state.answers[playerId] ?? {};
    return Object.values(mine).filter(Boolean).length * KHOI_DONG_POINTS;
}
