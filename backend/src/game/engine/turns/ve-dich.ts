// ve-dich turn logic as pure state transitions. No DB, no I/O.
// Scoring lives in ../scoring/ve-dich.ts; this module decides who may act,
// which question is open, and which powers are still available.
import { veDichPoints, type Power } from "../scoring/ve-dich.js";

export const DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"] as const;
export const VALUES = [20, 30, 40, 50] as const;
export const BUZZ_WINDOW_S = 5;

export interface VeDichQuestion {
    id: string;        // e.g. "THTH-40"
    domain: string;
    value: number;
}

export interface PlayerState {
    id: string;
    score: number;
    powersLeft: Power[];
}

export type Phase = 1 | 2;

export interface VeDichState {
    phase: Phase;
    players: PlayerState[];
    remaining: VeDichQuestion[];
    turnIndex: number;
    pendingPicks: VeDichQuestion[];
    open: OpenQuestion | null;
    buzzOpenedAt: string | null;   // ISO time the 5 s buzz window opened
    ended: boolean;
}

export interface OpenQuestion {
    question: VeDichQuestion;
    answerer: string;              // current player's id
    power: Power | null;           // declared before opening, applies to answerer
    stage: "current" | "buzz";     // current answers first, then buzz window
    buzzer: string | null;         // set when a buzzer wins the window
}

export type VeDichError =
    | { code: "WRONG_PHASE"; message: string }
    | { code: "NOT_YOUR_TURN"; message: string }
    | { code: "INVALID_QUESTION"; message: string }
    | { code: "NOT_HIGHEST"; message: string }
    | { code: "POWER_UNAVAILABLE"; message: string }
    | { code: "ALREADY_OPEN"; message: string }
    | { code: "NOTHING_OPEN"; message: string }
    | { code: "PHASE1_INCOMPLETE"; message: string };

export class VeDichRuleError extends Error {
    constructor(public readonly detail: VeDichError) {
        super(detail.message);
    }
}

function fail(code: VeDichError["code"], message: string): never {
    throw new VeDichRuleError({ code, message } as VeDichError);
}

export function createVeDich(
    questions: VeDichQuestion[],
    players: PlayerState[]
): VeDichState {
    return {
        phase: 1,
        players: orderForPhase(players, 1),
        remaining: [...questions],
        turnIndex: 0,
        pendingPicks: [],
        open: null,
        buzzOpenedAt: null,
        ended: false
    };
}

// Phase 1 is complete once no question is open and every player has had a turn.
export function phase1Complete(state: VeDichState): boolean {
    return state.phase === 1 && state.open === null && state.turnIndex >= state.players.length;
}

export function phase2Complete(state: VeDichState): boolean {
    return state.phase === 2 && state.open === null && state.turnIndex >= state.players.length;
}

// Move to phase 2. The turn order is fixed HERE, by score at this moment (lowest first).
export function beginPhase2(state: VeDichState): VeDichState {
    if (state.phase !== 1) fail("WRONG_PHASE", "already in phase 2");
    if (!phase1Complete(state)) fail("PHASE1_INCOMPLETE", "phase 1 is not complete");
    return {
        ...state,
        phase: 2,
        players: orderForPhase(state.players, 2),
        turnIndex: 0,
        pendingPicks: [],
        open: null,
        buzzOpenedAt: null
    };
}

export function endVeDich(state: VeDichState): VeDichState {
    if (state.ended) return state;
    return { ...state, ended: true, open: null, buzzOpenedAt: null };
}

// Phase 1: highest score first. Phase 2: lowest score first.
// Ties keep the input order (stable sort), which the caller supplies.
export function orderForPhase(players: PlayerState[], phase: Phase): PlayerState[] {
    const sorted = [...players];
    sorted.sort((a, b) => (phase === 1 ? b.score - a.score : a.score - b.score));
    return sorted;
}

export function currentPlayer(state: VeDichState): PlayerState {
    return state.players[state.turnIndex];
}

function maxRemainingValue(remaining: VeDichQuestion[]): number {
    return remaining.reduce((max, q) => Math.max(max, q.value), 0);
}

// Phase 1: the current player picks one question. It must be a highest-value one
// (ties among the top value are allowed; the player chooses which).
export function pickPhase1(
    state: VeDichState,
    playerId: string,
    questionId: string
): VeDichState {
    if (state.phase !== 1) fail("WRONG_PHASE", "pickPhase1 only applies in Phase 1");
    if (state.open) fail("ALREADY_OPEN", "a question is already open");
    if (currentPlayer(state).id !== playerId) fail("NOT_YOUR_TURN", "not this player's turn");

    const question = state.remaining.find((q) => q.id === questionId);
    if (!question) fail("INVALID_QUESTION", `question ${questionId} is not available`);
    if (question.value !== maxRemainingValue(state.remaining)) {
        fail("NOT_HIGHEST", "Phase 1 picks must be a highest-value remaining question");
    }

    return {
        ...state,
        remaining: state.remaining.filter((q) => q.id !== questionId),
        open: {
            question,
            answerer: playerId,
            power: null,
            stage: "current",
            buzzer: null
        },
        buzzOpenedAt: null
    };
}

// Phase 2: the current player commits 3 picks for their turn, in order.
export function pickPhase2(
    state: VeDichState,
    playerId: string,
    questionIds: string[]
): VeDichState {
    if (state.phase !== 2) fail("WRONG_PHASE", "pickPhase2 only applies in Phase 2");
    if (state.open) fail("ALREADY_OPEN", "a question is already open");
    if (currentPlayer(state).id !== playerId) fail("NOT_YOUR_TURN", "not this player's turn");
    if (questionIds.length !== 3) fail("INVALID_QUESTION", "Phase 2 requires exactly 3 picks");
    if (new Set(questionIds).size !== 3) fail("INVALID_QUESTION", "picks must be distinct");

    const picks = questionIds.map((id) => {
        const q = state.remaining.find((r) => r.id === id);
        if (!q) fail("INVALID_QUESTION", `question ${id} is not available`);
        return q;
    });

    return {
        ...state,
        remaining: state.remaining.filter((q) => !questionIds.includes(q.id)),
        pendingPicks: picks
    };
}

// Power declaration: at question open, by the current player only, at most one
// per question, and only if the player still has that power.
export function declarePower(
    state: VeDichState,
    playerId: string,
    power: Power | null
): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.open.answerer !== playerId) {
        fail("NOT_YOUR_TURN", "only the current player may declare a power");
    }
    if (state.open.stage !== "current") {
        fail("ALREADY_OPEN", "powers are declared before the question opens");
    }
    if (power === null) return state;

    const player = state.players.find((p) => p.id === playerId)!;
    if (!player.powersLeft.includes(power)) {
        fail("POWER_UNAVAILABLE", `${power} already spent`);
    }

    return {
        ...state,
        players: state.players.map((p) =>
            p.id === playerId
                ? { ...p, powersLeft: p.powersLeft.filter((x) => x !== power) }
                : p
        ),
        open: { ...state.open, power }
    };
}

// Phase 2 opens the question for the current player. Declaration happens here,
// then the answer is recorded and the buzz window opens.
export function openPhase2Question(state: VeDichState, questionId: string): VeDichState {
    if (state.phase !== 2) fail("WRONG_PHASE", "openPhase2Question only applies in Phase 2");
    if (state.open) fail("ALREADY_OPEN", "a question is already open");

    const question = state.pendingPicks.find((q) => q.id === questionId);
    if (!question) fail("INVALID_QUESTION", `question ${questionId} is not one of this turn's picks`);

    return {
        ...state,
        pendingPicks: state.pendingPicks.filter((q) => q.id !== questionId),
        open: {
            question,
            answerer: currentPlayer(state).id,
            power: null,
            stage: "current",
            buzzer: null
        },
        buzzOpenedAt: null
    };
}

// The current player's answer has been recorded and judged later. The buzz window opens now
// regardless of correctness, per the rules. Buzzes are resolved by the server receive order;
// the caller passes the first buzzer, and later buzzes are rejected by this function.
export function closeCurrentAnswer(state: VeDichState, openedAt: string): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.phase !== 2) return state;      // Phase 1 has no buzz window
    if (state.open.stage !== "current") fail("ALREADY_OPEN", "the buzz window already happened");

    return { ...state, open: { ...state.open, stage: "buzz" }, buzzOpenedAt: openedAt };
}

// Is the 5 s buzz window open at `nowIso`?
export function isBuzzOpen(state: VeDichState, nowIso: string): boolean {
    if (state.open === null || state.open.stage !== "buzz" || state.buzzOpenedAt === null) {
        return false;
    }
    const elapsed = Date.parse(nowIso) - Date.parse(state.buzzOpenedAt);
    return elapsed >= 0 && elapsed <= BUZZ_WINDOW_S * 1000;
}

export function buzz(state: VeDichState, playerId: string): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.phase !== 2) fail("WRONG_PHASE", "buzzing only exists in Phase 2");
    if (state.open.stage !== "buzz") fail("ALREADY_OPEN", "the buzz window is not open");
    if (state.open.buzzer !== null) fail("ALREADY_OPEN", "someone already buzzed first");
    if (playerId === state.open.answerer) fail("NOT_YOUR_TURN", "the current player cannot buzz");

    return { ...state, open: { ...state.open, buzzer: playerId } };
}

export interface Verdicts {
    answerer: boolean;          // current player correct?
    buzzer?: boolean;           // buzzer correct? (only if someone buzzed)
}

// Finish the question: apply each answerer's score independently, clear the open
// question. Each answerer's power (only the current player's) is applied in scoring.
export function resolveQuestion(state: VeDichState, verdicts: Verdicts): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    const { open } = state;

    if (open.stage === "current" && state.phase === 2) {
        // Caller must close the buzz window before resolving in Phase 2.
        fail("ALREADY_OPEN", "close the buzz window before resolving");
    }
    if (open.buzzer !== null && verdicts.buzzer === undefined) {
        fail("NOT_YOUR_TURN", "a buzzer was recorded, a buzzer verdict is required");
    }
    if (open.buzzer === null && verdicts.buzzer !== undefined) {
        fail("NOT_YOUR_TURN", "no buzzer was recorded, buzzer verdict not allowed");
    }

    const face = open.question.value;
    const answererPoints = veDichPoints({
        faceValue: face,
        correct: verdicts.answerer,
        power: open.power ?? undefined
    });
    const buzzerPoints =
        open.buzzer !== null
            ? veDichPoints({ faceValue: face, correct: verdicts.buzzer! })
            : 0;

    const scoreDelta = new Map<string, number>();
    scoreDelta.set(open.answerer, answererPoints);
    if (open.buzzer !== null) scoreDelta.set(open.buzzer, buzzerPoints);

    return {
        ...state,
        players: state.players.map((p) =>
            scoreDelta.has(p.id) ? { ...p, score: p.score + scoreDelta.get(p.id)! } : p
        ),
        open: null,
        buzzOpenedAt: null
    };
}

export function advanceTurn(state: VeDichState): VeDichState {
    if (state.open) fail("ALREADY_OPEN", "finish the open question first");
    const next = state.turnIndex + 1;
    return { ...state, turnIndex: next, pendingPicks: [] };
}

export { veDichPoints };
