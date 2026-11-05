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

// ─── Phase 2: typed, simultaneous, one 10 s window per question ──────────────

/**
 * Về Khởi động · lượt chung — the timed batch.
 *
 * SIX questions, everyone answers the SAME one, and the console opens the
 * window with Bấm giờ: from that click each player has `windowS` seconds to
 * type and submit. The input locks when the clock runs out — the server refuses
 * late answers, and the screen greys the field at zero.
 *
 *   each correct player → +10, independently (a wrong answer pays nothing)
 *
 * After the lock the console marks every card in the rail, and clicking the
 * NEXT number on the progress strip moves on — never before every submission
 * on the question carries a verdict (the live layer checks that).
 */
export interface Phase2State {
    kind: "phase2";
    /** What one correct answer pays — frozen when the round opened. */
    pointsPerCorrect: number;
    /** The window the console opens per question, in seconds. */
    windowS: number;
    questionIds: string[]; // six, in order
    /** The question in play; === questionIds.length once every one is played. */
    index: number;
    /** The window's start (Bấm giờ); null while the question waits. */
    openedAt: string | null;
    /**
     * Points per question, per player. REPLACED rather than accumulated, so a
     * card the console re-marks (Sai → Đúng) is corrected instead of paid twice.
     */
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

/** The question in play — null once every question has been played. */
export function phase2QuestionId(state: Phase2State): string | null {
    if (state.closed || state.index >= state.questionIds.length) return null;
    return state.questionIds[state.index];
}

export function phase2Complete(state: Phase2State): boolean {
    return state.closed || state.index >= state.questionIds.length;
}

/** Is the window for the question in play running right now? */
export function isPhase2WindowOpen(state: Phase2State, nowIso: string): boolean {
    if (state.openedAt === null || phase2QuestionId(state) === null) return false;
    const elapsed = Date.parse(nowIso) - Date.parse(state.openedAt);
    return elapsed >= 0 && elapsed <= state.windowS * 1000;
}

/**
 * Bấm giờ: the console opens the window for the question in play. Pressing it
 * again after the clock ran out gives the field another window — the desk's
 * call, and every submission already made stays on its card.
 */
export function openPhase2Window(state: Phase2State, nowIso: string): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "chung is over");
    if (phase2QuestionId(state) === null) fail("PHASE_ENDED", "every question has been played");
    if (isPhase2WindowOpen(state, nowIso)) fail("ALREADY_OPEN", "the window is already running");
    return { ...state, openedAt: nowIso };
}

/**
 * The console marks ONE card — the rail's selected player, Đúng or Sai. Every
 * submitted answer is judged this way, one card at a time, and the verdict is
 * what the ledger (and the fact written next to it) records.
 */
export function judgePhase2Card(state: Phase2State, playerId: string, correct: boolean): Phase2State {
    const questionId = phase2QuestionId(state);
    if (questionId === null) fail("PHASE_ENDED", "chung is over");

    const results = { ...state.results };
    results[questionId] = {
        ...(results[questionId] ?? {}),
        // Correct pays, wrong pays nothing — either way this verdict REPLACES
        // whatever this card said before, so a re-judgement is a correction.
        [playerId]: correct ? state.pointsPerCorrect : 0
    };
    return { ...state, results };
}

/**
 * The next number on the progress strip: move to the following question. The
 * window dies with the question it belonged to — the next one waits for its
 * own Bấm giờ.
 */
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
