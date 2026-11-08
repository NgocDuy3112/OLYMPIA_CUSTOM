import { khoiDongPoints } from "../scoring/khoi-dong.js";
import { fail } from "./errors.js";
import { KHOI_DONG_DEFAULTS, type KhoiDongRules } from "../rules.js";


export interface Phase1State {
    kind: "phase1";
    budgetS: number;            
    pointsPerCorrect: number;   
    questionIds: string[];       
    cursor: number;              
    elapsedS: number;            
    results: Record<string, { correct: boolean; points: number }>;
    ended: boolean;              
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

export function answerPhase1(
    state: Phase1State,
    params: { correct: boolean; spentS: number }
): Phase1State {
    if (state.ended) fail("PHASE_ENDED", "phase 1 is over");
    const elapsedS = state.elapsedS + params.spentS;
    const id = state.questionIds[state.cursor];

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

export function timeOutPhase1(state: Phase1State): Phase1State {
    if (state.ended) return state;
    return { ...state, elapsedS: state.budgetS, ended: true };
}

export function phase1Total(state: Phase1State): number {
    return Object.values(state.results).reduce((sum, r) => sum + r.points, 0);
}


export interface Phase2State {
    kind: "phase2";
    pointsPerCorrect: number;
    windowS: number;
    questionIds: string[]; 
    index: number;
    openedAt: string | null;
    results: Record<string, Record<string, number>>;
    closed: boolean;
}

export function startPhase2(
    questionIds: string[],
    rules: KhoiDongRules = KHOI_DONG_DEFAULTS
): Phase2State {
    if (questionIds.length !== rules.phase2Questions) {
        fail("VALIDATION", `chung needs exactly ${rules.phase2Questions} questions`);
    }
    return {
        kind: "phase2",
        pointsPerCorrect: rules.pointsPerCorrect,
        windowS: rules.phase2WindowS,
        questionIds,
        index: 0,
        openedAt: null,
        results: {},
        closed: false
    };
}

export function phase2QuestionId(state: Phase2State): string | null {
    if (state.closed || state.index >= state.questionIds.length) return null;
    return state.questionIds[state.index];
}

export function phase2Complete(state: Phase2State): boolean {
    return state.closed || state.index >= state.questionIds.length;
}

export function isPhase2WindowOpen(state: Phase2State, nowIso: string): boolean {
    if (state.openedAt === null || phase2QuestionId(state) === null) return false;
    const elapsed = Date.parse(nowIso) - Date.parse(state.openedAt);
    return elapsed >= 0 && elapsed <= state.windowS * 1000;
}

export function openPhase2Window(state: Phase2State, nowIso: string): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "chung is over");
    if (phase2QuestionId(state) === null) fail("PHASE_ENDED", "every question has been played");
    if (isPhase2WindowOpen(state, nowIso)) fail("ALREADY_OPEN", "the window is already running");
    return { ...state, openedAt: nowIso };
}

export function judgePhase2Card(state: Phase2State, playerId: string, correct: boolean): Phase2State {
    const questionId = phase2QuestionId(state);
    if (questionId === null) fail("PHASE_ENDED", "chung is over");

    const results = { ...state.results };
    results[questionId] = {
        ...(results[questionId] ?? {}),
        [playerId]: correct ? state.pointsPerCorrect : 0
    };
    return { ...state, results };
}

export function nextPhase2(state: Phase2State): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "chung is over");
    if (phase2QuestionId(state) === null) fail("PHASE_ENDED", "every question has been played");

    const index = state.index + 1;
    return { ...state, index, openedAt: null, closed: index >= state.questionIds.length };
}

export function closePhase2(state: Phase2State): Phase2State {
    return { ...state, closed: true };
}

export function phase2Points(state: Phase2State, playerId: string): number {
    return Object.values(state.results).reduce((sum, byPlayer) => sum + (byPlayer[playerId] ?? 0), 0);
}
