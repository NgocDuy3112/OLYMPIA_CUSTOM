import { assignPayout, veDichPoints, type Power } from "../scoring/ve-dich.js";
import { VE_DICH_DEFAULTS, type VeDichRules } from "../rules.js";

export const VALUES = [20, 30, 40, 50] as const;

export const BOARD_COMPOSITION: Record<(typeof VALUES)[number], number> = {
    20: 6,
    30: 6,
    40: 4,
    50: 4
};

function compositionDiffs(questions: VeDichQuestion[]): string[] {
    const counted = new Map<number, number>();
    for (const q of questions) counted.set(q.value, (counted.get(q.value) ?? 0) + 1);

    const diffs: string[] = [];
    for (const value of VALUES) {
        const want = BOARD_COMPOSITION[value];
        const got = counted.get(value) ?? 0;
        if (got !== want) diffs.push(`${value}×${got} (want ${want})`);
    }
    for (const [value, got] of counted) {
        if (!VALUES.includes(value as (typeof VALUES)[number])) {
            diffs.push(`${value}×${got} (not a face value)`);
        }
    }
    return diffs;
}

export interface VeDichQuestion {
    id: string;        
    value: number;     
    timeLimit: number | null;
}

export interface PlayerState {
    id: string;
    score: number;
    powersLeft: Power[];
}

export type Phase = 1 | 2;

export interface VeDichState {
    rules: VeDichRules;
    phase: Phase;
    players: PlayerState[];
    remaining: VeDichQuestion[];
    deferred?: VeDichQuestion[];
    turnIndex: number;
    pendingPicks: VeDichQuestion[];
    open: OpenQuestion | null;
    buzzOpenedAt: string | null;   
    stagedPower?: StagedPower | null;
    turnPowerUsed?: boolean;
    buzzLocked?: boolean;
    ended: boolean;
    revealedAnswer?: string | null;
}

export interface StagedPower {
    power: Power;
    targetId?: string;
}

export interface OpenQuestion {
    question: VeDichQuestion;
    answerer: string;              
    power: Power | null;           
    stage: "current" | "buzz";     
    buzzer: string | null;         
    buzzerMs?: number | null;
    assignedTo?: string | null;
}

export type VeDichError =
    | { code: "WRONG_PHASE"; message: string }
    | { code: "NOT_YOUR_TURN"; message: string }
    | { code: "INVALID_QUESTION"; message: string }
    | { code: "POWER_UNAVAILABLE"; message: string }
    | { code: "ONE_POWER_PER_TURN"; message: string }
    | { code: "ALREADY_OPEN"; message: string }
    | { code: "NOTHING_OPEN"; message: string }
    | { code: "WINDOW_CLOSED"; message: string }
    | { code: "INVALID_TARGET"; message: string }
    | { code: "WRONG_PHASE_FOR_POWER"; message: string }
    | { code: "BOARD_COMPOSITION"; message: string }
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
    players: PlayerState[],
    rules: VeDichRules = VE_DICH_DEFAULTS
): VeDichState {
    const diffs = compositionDiffs(questions);
    if (diffs.length > 0) {
        fail("BOARD_COMPOSITION", `ve-dich needs 6×20, 6×30, 4×40, 4×50 — got ${diffs.join(", ")}`);
    }

    const isChung = (q: VeDichQuestion) => q.value === 20 || q.value === 30;
    return {
        rules,
        phase: 1,
        players: orderForPhase(players, 1),
        remaining: questions.filter(isChung),
        deferred: questions.filter((q) => !isChung(q)),
        turnIndex: 0,
        pendingPicks: [],
        open: null,
        buzzOpenedAt: null,
        ended: false
    };
}

export function phase1Complete(state: VeDichState): boolean {
    return state.phase === 1 && state.open === null && state.turnIndex >= state.players.length;
}

export function phase1Untouched(state: VeDichState): boolean {
    return state.phase === 1 && state.turnIndex === 0 && state.open === null && state.pendingPicks.length === 0;
}

export function phase2Complete(state: VeDichState): boolean {
    return state.phase === 2 && state.open === null && state.turnIndex >= state.players.length;
}

export function beginPhase2(state: VeDichState): VeDichState {
    if (state.phase !== 1) fail("WRONG_PHASE", "already in phase 2");
    if (!phase1Complete(state) && !phase1Untouched(state)) fail("PHASE1_INCOMPLETE", "phase 1 is not complete");
    return {
        ...state,
        phase: 2,
        remaining: [...state.remaining, ...(state.deferred ?? [])],
        deferred: [],
        players: orderForPhase(state.players, 2),
        turnIndex: 0,
        pendingPicks: [],
        open: null,
        buzzOpenedAt: null,
        buzzLocked: false
    };
}

export function endVeDich(state: VeDichState): VeDichState {
    if (state.ended) return state;
    return { ...state, ended: true, open: null, buzzOpenedAt: null, buzzLocked: false };
}

export function orderForPhase(players: PlayerState[], phase: Phase): PlayerState[] {
    const sorted = [...players];
    sorted.sort((a, b) => (phase === 1 ? b.score - a.score : a.score - b.score));
    return sorted;
}

export function currentPlayer(state: VeDichState): PlayerState {
    return state.players[state.turnIndex];
}

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
    if (question.value !== 20 && question.value !== 30) {
        fail("INVALID_QUESTION", "phase 1 only plays 20- and 30-point questions");
    }

    return {
        ...state,
        remaining: state.remaining.filter((q) => q.id !== questionId),
        open: {
            question,
            answerer: playerId,
            power: null,
            stage: "current",
            buzzer: null,
            assignedTo: null
        },
        buzzOpenedAt: null,
        buzzLocked: false
    };
}

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

export function declarePower(
    state: VeDichState,
    playerId: string,
    power: Power | null,
    options: { targetId?: string } = {}
): VeDichState {
    if (state.phase !== 2) {
        fail("WRONG_PHASE_FOR_POWER", "powers only exist in Về đích Riêng (phase 2)");
    }
    if (state.open) {
        fail("ALREADY_OPEN", "powers are declared before the question opens");
    }
    if (currentPlayer(state).id !== playerId) {
        fail("NOT_YOUR_TURN", "only the current player's power may be staged");
    }
    if (state.pendingPicks.length === 0) {
        fail("NOTHING_OPEN", "pick the turn's questions first");
    }
    if (power === null) return state;

    if (state.turnPowerUsed === true) {
        fail("ONE_POWER_PER_TURN", "the turn has already chosen its power");
    }

    const player = state.players.find((p) => p.id === playerId)!;
    if (!player.powersLeft.includes(power)) {
        fail("POWER_UNAVAILABLE", `${power} already spent`);
    }
    if (power === "ASSIGN") {
        const targetId = options.targetId;
        if (!targetId) fail("INVALID_TARGET", "ASSIGN needs a player to hand the question to");
        if (targetId === playerId) fail("INVALID_TARGET", "you cannot assign the question to yourself");
        if (!state.players.some((p) => p.id === targetId)) {
            fail("INVALID_TARGET", `${targetId} is not playing this round`);
        }
        return { ...state, stagedPower: { power, targetId }, turnPowerUsed: true };
    }
    return { ...state, stagedPower: { power }, turnPowerUsed: true };
}

export function openPhase2Question(state: VeDichState, questionId: string, nowIso?: string): VeDichState {
    if (state.phase !== 2) fail("WRONG_PHASE", "openPhase2Question only applies in Phase 2");
    if (state.open) fail("ALREADY_OPEN", "a question is already open");

    const question = state.pendingPicks.find((q) => q.id === questionId);
    if (!question) fail("INVALID_QUESTION", `question ${questionId} is not one of this turn's picks`);

    const staged = state.stagedPower ?? null;
    const isAssign = staged?.power === "ASSIGN";
    if (isAssign && !nowIso) fail("INVALID_TARGET", "ASSIGN needs the server clock to open the race");
    const answerer = currentPlayer(state).id;
    const players = staged === null
        ? state.players
        : state.players.map((p) =>
              p.id === answerer
                  ? { ...p, powersLeft: p.powersLeft.filter((x) => x !== staged.power) }
                  : p
          );

    return {
        ...state,
        players,
        stagedPower: null,
        turnPowerUsed: staged !== null || state.turnPowerUsed === true,
        pendingPicks: state.pendingPicks.filter((q) => q.id !== questionId),
        open: {
            question,
            answerer,
            power: staged?.power ?? null,
            stage: isAssign ? "buzz" : "current",
            buzzer: null,
            assignedTo: isAssign ? staged!.targetId! : null
        },
        buzzOpenedAt: isAssign ? nowIso! : null,
        buzzLocked: false
    };
}

export function closeCurrentAnswer(state: VeDichState, openedAt: string): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.phase !== 2) return state;      
    if (state.open.stage !== "current") fail("ALREADY_OPEN", "the buzz window already happened");

    return { ...state, open: { ...state.open, stage: "buzz" }, buzzOpenedAt: openedAt, buzzLocked: false };
}

export function buzzWindowSeconds(state: VeDichState): number {
    if (state.open?.power === "ASSIGN") {
        return state.open.question.timeLimit ?? state.rules.buzzWindowS;
    }
    return state.rules.buzzWindowS;
}

export function lockBuzzWindow(state: VeDichState): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.open.stage !== "buzz") fail("ALREADY_OPEN", "there is no open buzz window");
    if (state.open.buzzer !== null) fail("ALREADY_OPEN", "someone already buzzed — the race is settled");
    return { ...state, buzzLocked: true };
}

export function isBuzzOpen(state: VeDichState, nowIso: string): boolean {
    if (state.buzzLocked === true) return false;      
    if (state.open === null || state.open.stage !== "buzz" || state.buzzOpenedAt === null) {
        return false;
    }
    const elapsed = Date.parse(nowIso) - Date.parse(state.buzzOpenedAt);
    return elapsed >= 0 && elapsed <= buzzWindowSeconds(state) * 1000;
}

export function mayBuzz(state: VeDichState, playerId: string): boolean {
    if (state.open === null) return false;
    const assignedTo = state.open.assignedTo ?? null;
    if (assignedTo !== null) {
        return playerId === state.open.answerer || playerId === assignedTo;
    }
    return playerId !== state.open.answerer;
}

export function buzz(state: VeDichState, playerId: string, nowIso: string): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.phase !== 2) fail("WRONG_PHASE", "buzzing only exists in Phase 2");
    if (state.open.stage !== "buzz") fail("ALREADY_OPEN", "the buzz window is not open");
    if (!isBuzzOpen(state, nowIso)) fail("WINDOW_CLOSED", "the buzz window has closed");
    if (state.open.buzzer !== null) fail("ALREADY_OPEN", "someone already buzzed first");
    if (!mayBuzz(state, playerId)) fail("NOT_YOUR_TURN", "this question is not yours to buzz");

    return {
        ...state,
        open: {
            ...state.open,
            buzzer: playerId,
            buzzerMs: state.buzzOpenedAt === null
                ? 0
                : Math.max(0, Date.parse(nowIso) - Date.parse(state.buzzOpenedAt))
        }
    };
}

export interface Verdicts {
    answerer: boolean;          
    buzzer?: boolean;           
}

export function resolveQuestion(state: VeDichState, verdicts: Verdicts): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    const { open } = state;
    const assignedTo = open.assignedTo ?? null;

    if (open.stage === "current" && state.phase === 2) {
        fail("ALREADY_OPEN", "the question is still open");
    }
    if (assignedTo !== null) {
        if (open.buzzer !== null && verdicts.buzzer === undefined) {
            fail("NOT_YOUR_TURN", "a buzzer was recorded, a buzzer verdict is required");
        }
        return resolveAssign(state, verdicts);
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
        power: open.power === "STAR" ? "STAR" : undefined
    }, state.rules);
    const buzzerPoints =
        open.buzzer !== null
            ? veDichPoints({ faceValue: face, correct: verdicts.buzzer! }, state.rules)
            : 0;

    return applyDeltas(state, [
        [open.answerer, answererPoints],
        ...(open.buzzer !== null ? [[open.buzzer, buzzerPoints] as [string, number]] : [])
    ]);
}

function resolveAssign(state: VeDichState, verdicts: Verdicts): VeDichState {
    const open = state.open!;
    const partner = open.assignedTo!;
    const buzzer = open.buzzer;

    if (buzzer === null) {
        const payout = assignPayout({ faceValue: open.question.value, buzzerCorrect: null });
        return applyDeltas(state, [[open.answerer, payout.buzzer], [partner, payout.partner]]);
    }

    const payout = assignPayout({ faceValue: open.question.value, buzzerCorrect: verdicts.buzzer! });
    const other = buzzer === open.answerer ? partner : open.answerer;
    return applyDeltas(state, [[buzzer, payout.buzzer], [other, payout.partner]]);
}

function applyDeltas(state: VeDichState, deltas: Array<[string, number]>): VeDichState {
    const scoreDelta = new Map<string, number>();
    for (const [id, delta] of deltas) {
        scoreDelta.set(id, (scoreDelta.get(id) ?? 0) + delta);
    }
    return {
        ...state,
        players: state.players.map((p) =>
            scoreDelta.has(p.id) ? { ...p, score: p.score + scoreDelta.get(p.id)! } : p
        ),
        open: null,
        buzzOpenedAt: null,
        buzzLocked: false
    };
}

export function advanceTurn(state: VeDichState): VeDichState {
    if (state.open) fail("ALREADY_OPEN", "finish the open question first");
    const next = state.turnIndex + 1;
    return { ...state, turnIndex: next, pendingPicks: [], stagedPower: null, turnPowerUsed: false };
}

export { veDichPoints };
