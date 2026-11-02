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

/**
 * Về Khởi động · lượt chung — the buzz race.
 *
 * Twelve questions, ONE at a time. On each: the MC opens a 5 s buzz window, the
 * whole field races, and the FASTEST one answers out loud (the rest are locked —
 * one buzz wins, exactly as in every other buzzing round).
 *
 *   correct on the first window  → +10, the question is done
 *   wrong                        → that player is locked out, a SECOND window
 *                                  opens for the rest, and the fastest of them
 *                                  answers: correct → +5, wrong → the question dies
 *   nobody buzzes                → the question dies (no points either way)
 *
 * There is no shared clock: a question lives in its own windows, and the phase
 * ends when its twelve questions are done (or the MC closes it).
 */
export interface Phase2Buzz {
    questionId: string;
    attempt: 1 | 2;                 // which chance is running
    openedAt: string | null;        // the open window's start, null = no window
    buzzer: string | null;          // the fastest — the only one who may answer
    /** Locked out of the re-buzz: the player who answered attempt 1 wrong. */
    excluded: string[];
    /** Points this question awarded, once judged. null = still live. */
    settled: number | null;
}

export interface Phase2State {
    kind: "phase2";
    /** First correct answer (window 1). */
    pointsPerCorrect: number;
    /** Second-chance correct answer (window 2). */
    secondChancePoints: number;
    buzzWindowS: number;
    questionIds: string[];
    /** The question in play; === questionIds.length once the phase is done. */
    index: number;
    /** null between questions. */
    current: Phase2Buzz | null;
    /** Running total per player — the phase's own ledger. */
    awards: Record<string, number>;
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
        kind: "phase2",
        pointsPerCorrect: rules.pointsPerCorrect,
        secondChancePoints: rules.secondChancePoints,
        buzzWindowS: rules.phase2BuzzWindowS,
        questionIds,
        index: 0,
        current: null,
        awards: {},
        closed: false
    };
}

/** The phase is done when its questions are: no current question, none left. */
export function phase2Complete(state: Phase2State): boolean {
    return state.closed || (state.index >= state.questionIds.length && state.current === null);
}

/** Is `playerId` still allowed to buzz the current window? */
export function mayBuzzPhase2(state: Phase2State, playerId: string): boolean {
    const current = state.current;
    if (current === null || current.openedAt === null) return false;
    if (current.buzzer !== null) return false;              // the fastest already won
    return !current.excluded.includes(playerId);
}

export function isPhase2WindowOpen(state: Phase2State, nowIso: string): boolean {
    const current = state.current;
    if (current === null || current.openedAt === null) return false;
    const elapsed = Date.parse(nowIso) - Date.parse(current.openedAt);
    return elapsed >= 0 && elapsed <= state.buzzWindowS * 1000;
}

/**
 * The MC opens a window for the question in play. First call starts the
 * question (attempt 1); after a wrong verdict it opens attempt 2 for everyone
 * the first answerer is not.
 */
export function openPhase2Buzz(state: Phase2State, nowIso: string): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "phase 2 is over");
    if (state.index >= state.questionIds.length) fail("PHASE_ENDED", "every question has been played");

    const current = state.current;
    if (current !== null && current.buzzer !== null) {
        fail("ALREADY_OPEN", "someone buzzed first — judge that answer");
    }

    const next: Phase2Buzz = current === null
        ? { questionId: state.questionIds[state.index], attempt: 1, openedAt: nowIso, buzzer: null, excluded: [], settled: null }
        : { ...current, openedAt: nowIso, buzzer: null };

    return { ...state, current: next };
}

/** The player's buzz: server receive order decides, and only the fastest lands. */
export function buzzPhase2(state: Phase2State, playerId: string, nowIso: string): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "phase 2 is over");
    const current = state.current;
    if (current === null || current.openedAt === null) {
        fail("NOTHING_OPEN", "no buzz window is open");
    }
    if (!isPhase2WindowOpen(state, nowIso)) {
        fail("WINDOW_CLOSED", "the buzz window has closed");
    }
    if (current.buzzer !== null) {
        fail("ALREADY_OPEN", "someone already buzzed first");
    }
    if (current.excluded.includes(playerId)) {
        fail("NOT_YOUR_TURN", "you are locked out of this question's re-buzz");
    }

    return { ...state, current: { ...current, buzzer: playerId } };
}

/**
 * The MC judges the buzzed answer.
 *
 *   correct on attempt 1 → +pointsPerCorrect, next question
 *   correct on attempt 2 → +secondChancePoints, next question
 *   wrong on attempt 1   → the answerer is locked out, attempt 2 is armed
 *   wrong on attempt 2   → the question dies
 */
export function judgePhase2(state: Phase2State, correct: boolean, rules: KhoiDongRules = KHOI_DONG_DEFAULTS): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "phase 2 is over");
    const current = state.current;
    if (current === null || current.buzzer === null) {
        fail("NOTHING_OPEN", "nobody has buzzed this question");
    }

    const buzzer = current.buzzer;

    if (correct) {
        const points = current.attempt === 1 ? current.settled ?? state.pointsPerCorrect : state.secondChancePoints;
        return settle(state, current, buzzer, points);
    }

    if (current.attempt === 1) {
        // Arm the re-buzz: the wrong answerer watches the rest race for it.
        return {
            ...state,
            current: { ...current, attempt: 2, openedAt: null, buzzer: null, excluded: [...current.excluded, buzzer] }
        };
    }

    // Second wrong answer: the question dies, no points to anyone.
    return settle(state, current, null, 0);
}

/** The MC moves on without a score (nobody buzzed, or the window ran out twice). */
export function nextPhase2Question(state: Phase2State): Phase2State {
    if (state.closed) fail("PHASE_ENDED", "phase 2 is over");
    if (state.current !== null && state.current.buzzer !== null) {
        fail("ALREADY_OPEN", "judge the buzzed answer first");
    }
    return settle(state, state.current, null, 0);
}

function settle(
    state: Phase2State,
    current: Phase2Buzz | null,
    awardedTo: string | null,
    points: number
): Phase2State {
    const awards = { ...state.awards };
    if (awardedTo !== null && points > 0) {
        awards[awardedTo] = (awards[awardedTo] ?? 0) + points;
    }
    const index = state.index + 1;
    return {
        ...state,
        index,
        current: null,
        awards,
        closed: index >= state.questionIds.length
    };
}

export function closePhase2(state: Phase2State): Phase2State {
    return { ...state, closed: true };
}

export function phase2Points(state: Phase2State, playerId: string): number {
    return state.awards[playerId] ?? 0;
}
