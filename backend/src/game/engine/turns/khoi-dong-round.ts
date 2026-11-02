// khoi-dong as a whole round: phase 1 is one run per player (each with their own
// 45 s); phase 2 is a twelve-question BUZZ race (see ./khoi-dong.ts Phase2State).
// Composes the per-phase primitives in ./khoi-dong.ts; pure, no I/O.
import {
    answerPhase1,
    buzzPhase2,
    closePhase2,
    isPhase2WindowOpen,
    judgePhase2,
    mayBuzzPhase2,
    nextPhase2Question,
    openPhase2Buzz,
    phase1Total,
    phase2Complete,
    phase2Points,
    startPhase1,
    startPhase2,
    timeOutPhase1,
    type Phase1State,
    type Phase2State
} from "./khoi-dong.js";
import { fail } from "./errors.js";
import { KHOI_DONG_DEFAULTS, type KhoiDongRules } from "../rules.js";

export interface KhoiDongState {
    // The rulebook's numbers, frozen when the round opened.
    rules: KhoiDongRules;
    stage: "phase1" | "phase2";
    ended: boolean;
    order: string[];                        // player turn order for phase 1
    activeIndex: number;                    // whose phase-1 run is active
    runs: Record<string, Phase1State>;      // one run per player
    phase2: Phase2State | null;             // created when phase 2 begins
}

export function startKhoiDong(
    playerIds: string[],
    phase1Ids: string[],
    rules: KhoiDongRules = KHOI_DONG_DEFAULTS
): KhoiDongState {
    if (playerIds.length === 0) fail("VALIDATION", "khoi-dong needs at least one player");
    const runs: Record<string, Phase1State> = {};
    for (const id of playerIds) runs[id] = startPhase1(phase1Ids, rules);
    return {
        rules,
        stage: "phase1", ended: false, order: [...playerIds],
        activeIndex: 0, runs, phase2: null
    };
}

export function activePlayerId(state: KhoiDongState): string | null {
    if (state.stage !== "phase1") return null;
    return state.order[state.activeIndex] ?? null;
}

// The question the active player is on, for recording the answer against it.
export function activeQuestionId(state: KhoiDongState): string | null {
    if (state.stage !== "phase1") return null;
    const id = activePlayerId(state);
    if (id === null) return null;
    const run = state.runs[id];
    if (run.ended) return null;
    return run.questionIds[run.cursor] ?? null;
}

export function phase1Complete(state: KhoiDongState): boolean {
    return state.order.every((id) => state.runs[id].ended);
}

/**
 * Phase 1 has recorded NOTHING yet — the console may skip it (starting straight at
 * Chung costs the oral runs, which is the confirmed rule). The moment ANY
 * oral answer exists, PHASE1_INCOMPLETE keeps guarding: finish phase 1 first.
 */
export function phase1Untouched(state: KhoiDongState): boolean {
    return state.order.every((id) => Object.keys(state.runs[id].results).length === 0);
}

// Move to the next player's run. At the last player the index stays; phase1Complete
// reports whether everyone is done.
function advanceActive(state: KhoiDongState): KhoiDongState {
    return { ...state, activeIndex: Math.min(state.activeIndex + 1, state.order.length - 1) };
}

// The console records the active player's oral answer, with the seconds spent on it.
export function recordOral(
    state: KhoiDongState,
    params: { correct: boolean; spentS: number }
): KhoiDongState {
    if (state.stage !== "phase1") fail("WRONG_STAGE", "phase 1 is over");
    const id = activePlayerId(state);
    if (id === null) fail("NO_ACTIVE_PLAYER", "no player is answering");
    const run = state.runs[id];
    if (run.ended) fail("RUN_ENDED", `${id} has finished phase 1`);

    const runs = { ...state.runs, [id]: answerPhase1(run, params) };
    const next: KhoiDongState = { ...state, runs };
    return runs[id].ended ? advanceActive(next) : next;
}

// The active player's 45 s ran out: their run ends and the next player starts.
export function timeOutRun(state: KhoiDongState): KhoiDongState {
    if (state.stage !== "phase1") fail("WRONG_STAGE", "phase 1 is over");
    const id = activePlayerId(state);
    if (id === null) fail("NO_ACTIVE_PLAYER", "no player is answering");

    const runs = { ...state.runs, [id]: timeOutPhase1(state.runs[id]) };
    return advanceActive({ ...state, runs });
}

// Phase 2 opens once every player has finished their phase-1 run. There is no
// shared clock: each question lives in its own 5 s buzz windows.
export function beginPhase2(state: KhoiDongState, phase2Ids: string[]): KhoiDongState {
    if (state.stage !== "phase1") fail("WRONG_STAGE", "phase 1 is over");
    if (!phase1Complete(state) && !phase1Untouched(state)) fail("PHASE1_INCOMPLETE", "not every player has finished phase 1");
    return { ...state, stage: "phase2", phase2: startPhase2(phase2Ids, state.rules) };
}

function requirePhase2(state: KhoiDongState): Phase2State {
    if (state.stage !== "phase2" || state.phase2 === null) fail("WRONG_STAGE", "phase 2 is not open");
    if (state.ended) fail("ENDED", "the round has ended");
    return state.phase2;
}

/** The the console opens (or re-opens) the buzz window for the question in play. */
export function openBuzz(state: KhoiDongState, nowIso: string): KhoiDongState {
    return { ...state, phase2: openPhase2Buzz(requirePhase2(state), nowIso) };
}

/** A player's buzz — server receive order, one winner, everyone else blocked. */
export function recordBuzz(state: KhoiDongState, playerId: string, nowIso: string): KhoiDongState {
    return { ...state, phase2: buzzPhase2(requirePhase2(state), playerId, nowIso) };
}

/** The the console's verdict on the buzzed answer: +10 first chance, +5 second, else dead. */
export function judgeBuzz(state: KhoiDongState, correct: boolean): KhoiDongState {
    return { ...state, phase2: judgePhase2(requirePhase2(state), correct, state.rules) };
}

/** Move on: nobody buzzed, or the window ran out with no answer worth scoring. */
export function nextQuestion(state: KhoiDongState): KhoiDongState {
    return { ...state, phase2: nextPhase2Question(requirePhase2(state)) };
}

export function closeBuzzPhase(state: KhoiDongState): KhoiDongState {
    return { ...state, phase2: closePhase2(requirePhase2(state)) };
}

export function phase2PointsOf(state: KhoiDongState, playerId: string): number {
    return state.phase2 === null ? 0 : phase2Points(state.phase2, playerId);
}

export function phase2IsComplete(state: KhoiDongState): boolean {
    return state.phase2 === null ? false : phase2Complete(state.phase2);
}

export { isPhase2WindowOpen, mayBuzzPhase2 };

export function endKhoiDong(state: KhoiDongState): KhoiDongState {
    if (state.ended) return state;
    return {
        ...state,
        ended: true,
        phase2: state.phase2 === null ? null : closePhase2(state.phase2)
    };
}

// A player's total across both phases.
export function khoiDongPoints(state: KhoiDongState, playerId: string): number {
    const run = state.runs[playerId];
    const phase1 = run ? phase1Total(run) : 0;
    const phase2 = state.phase2 ? phase2Points(state.phase2, playerId) : 0;
    return phase1 + phase2;
}
