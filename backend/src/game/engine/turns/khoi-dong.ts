// khoi-dong: two phases, each with its own clock. Pure state transitions.
import { khoiDongPoints } from "../scoring/khoi-dong.js";
import { fail } from "./errors.js";
import { KHOI_DONG_DEFAULTS, type KhoiDongRules } from "../rules.js";

// ─── Phase 1: oral, sequential, one shared 45 s clock ─────────────────────────

export interface Phase1State {
    kind: "phase1";
    budgetS: number;            // the phase's clock, from the rulebook
    pointsPerCorrect: number;   // the rulebook's points
    questionIds: string[];       // 6 questions, in order
    cursor: number;              // index of the question being asked
    elapsedS: number;            // time used so far
    results: Record<string, { correct: boolean; points: number }>;
    ended: boolean;              // true once all asked, or the budget ran out
}

export function startPhase1(
    questionIds: string[],
    rules: KhoiDongRules = KHOI_DONG_DEFAULTS
): Phase1State {
    if (questionIds.length !== rules.phase1Questions) {
        fail("VALIDATION", `phase 1 needs exactly ${rules.phase1Questions} questions`);
    }
    return {
        kind: "phase1", questionIds, cursor: 0, elapsedS: 0, results: {}, ended: false,
        budgetS: rules.phase1BudgetS, pointsPerCorrect: rules.pointsPerCorrect
    };
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
    if (elapsedS > state.budgetS) {
        return { ...state, elapsedS: state.budgetS, ended: true };
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
                points: khoiDongPoints(params.correct, state.pointsPerCorrect)
            }
        },
        ended: cursor >= state.questionIds.length
    };
}

// The clock ran out between questions: the phase ends, unanswered questions score 0.
export function timeOutPhase1(state: Phase1State): Phase1State {
    if (state.ended) return state;
    return { ...state, elapsedS: state.budgetS, ended: true };
}

export function phase1Total(state: Phase1State): number {
    return Object.values(state.results).reduce((sum, r) => sum + r.points, 0);
}

// ─── Phase 2: typed, simultaneous, one shared 60 s clock ──────────────────────

export interface Phase2State {
    kind: "phase2";
    budgetS: number;            // the phase's shared clock, from the rulebook
    pointsPerCorrect: number;   // the rulebook's points
    questionIds: string[];                  // 6 questions, all visible at once
    elapsedS: number;
    answers: Record<string, Record<string, boolean>>; // playerId → questionId → correct
    closed: boolean;
}

export function startPhase2(
    questionIds: string[],
    rules: KhoiDongRules = KHOI_DONG_DEFAULTS
): Phase2State {
    if (questionIds.length !== rules.phase2Questions) {
        fail("VALIDATION", `phase 2 needs exactly ${rules.phase2Questions} questions`);
    }
    return {
        kind: "phase2", questionIds, elapsedS: 0, answers: {}, closed: false,
        budgetS: rules.phase2BudgetS, pointsPerCorrect: rules.pointsPerCorrect
    };
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
    if (params.atS > state.budgetS) {
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
    return { ...state, closed: true, elapsedS: state.budgetS };
}

export function phase2Points(state: Phase2State, playerId: string): number {
    const mine = state.answers[playerId] ?? {};
    return Object.values(mine).filter(Boolean).length * state.pointsPerCorrect;
}
