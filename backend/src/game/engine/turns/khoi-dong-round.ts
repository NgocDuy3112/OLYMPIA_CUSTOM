import {
    answerPhase1,
    closePhase2,
    isPhase2WindowOpen,
    judgePhase2Card,
    nextPhase2,
    openPhase2Window,
    phase1Total,
    phase2Complete,
    phase2Points,
    phase2QuestionId,
    startPhase1,
    startPhase2,
    timeOutPhase1,
    type Phase1State,
    type Phase2State
} from "./khoi-dong.js";
import { fail } from "./errors.js";
import { KHOI_DONG_DEFAULTS, type KhoiDongRules } from "../rules.js";

export interface KhoiDongState {
    rules: KhoiDongRules;
    stage: "phase1" | "phase2";
    ended: boolean;
    order: string[];                        
    activeIndex: number;                    
    runs: Record<string, Phase1State>;      
    phase2: Phase2State | null;             
    revealedAnswer?: string | null;
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

export function phase1Untouched(state: KhoiDongState): boolean {
    return state.order.every((id) => Object.keys(state.runs[id].results).length === 0);
}

function advanceActive(state: KhoiDongState): KhoiDongState {
    return { ...state, activeIndex: Math.min(state.activeIndex + 1, state.order.length - 1) };
}

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

export function timeOutRun(state: KhoiDongState): KhoiDongState {
    if (state.stage !== "phase1") fail("WRONG_STAGE", "phase 1 is over");
    const id = activePlayerId(state);
    if (id === null) fail("NO_ACTIVE_PLAYER", "no player is answering");

    const runs = { ...state.runs, [id]: timeOutPhase1(state.runs[id]) };
    return advanceActive({ ...state, runs });
}

export function beginPhase2(state: KhoiDongState, phase2Ids: string[]): KhoiDongState {
    if (state.stage !== "phase1") fail("WRONG_STAGE", "phase 1 is over");
    if (!phase1Complete(state) && !phase1Untouched(state)) fail("PHASE1_INCOMPLETE", "not every player has finished phase 1");
    return { ...state, stage: "phase2", phase2: startPhase2(phase2Ids, state.rules) };
}

function requirePhase2(state: KhoiDongState): Phase2State {
    if (state.stage !== "phase2" || state.phase2 === null) fail("WRONG_STAGE", "chung is not open");
    if (state.ended) fail("ENDED", "the round has ended");
    return state.phase2;
}

export function openWindow(state: KhoiDongState, nowIso: string): KhoiDongState {
    return { ...state, phase2: openPhase2Window(requirePhase2(state), nowIso) };
}

export function judgeCard(state: KhoiDongState, playerId: string, correct: boolean): KhoiDongState {
    return { ...state, phase2: judgePhase2Card(requirePhase2(state), playerId, correct) };
}

export function nextQuestion(state: KhoiDongState): KhoiDongState {
    return { ...state, phase2: nextPhase2(requirePhase2(state)) };
}

export { isPhase2WindowOpen, phase2QuestionId };

export function endKhoiDong(state: KhoiDongState): KhoiDongState {
    if (state.ended) return state;
    return {
        ...state,
        ended: true,
        phase2: state.phase2 === null ? null : closePhase2(state.phase2)
    };
}

export function khoiDongPoints(state: KhoiDongState, playerId: string): number {
    const run = state.runs[playerId];
    const phase1 = run ? phase1Total(run) : 0;
    const phase2 = state.phase2 ? phase2Points(state.phase2, playerId) : 0;
    return phase1 + phase2;
}
