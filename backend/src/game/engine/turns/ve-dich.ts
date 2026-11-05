// ve-dich turn logic as pure state transitions. No DB, no I/O.
// Scoring lives in ../scoring/ve-dich.ts; this module decides who may act,
// which question is open, and which powers are still available.
import { assignPayout, veDichPoints, type Power } from "../scoring/ve-dich.js";
import { VE_DICH_DEFAULTS, type VeDichRules } from "../rules.js";

export const VALUES = [20, 30, 40, 50] as const;

/**
 * The board's composition — the SHOW's, not the staff's: six 20s, six 30s,
 * four 40s, four 50s (20 cells). Chung plays the twelve 20/30 cells, Riêng the
 * eight 40/50s. A question set that does not match this is refused at start, so
 * a wrong board can never reach the projector.
 */
export const BOARD_COMPOSITION: Record<(typeof VALUES)[number], number> = {
    20: 6,
    30: 6,
    40: 4,
    50: 4
};

/** How a question set differs from BOARD_COMPOSITION, as "20×5 (want 6)" lines. */
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
    id: string;        // the frozen MatchQuestion id
    value: number;     // the face value — 20/30 in Chung, 40/50 in Riêng
    // The question's own limit (seconds). An ASSIGN race runs on THIS clock —
    // both halves must buzz before the question's time runs out.
    timeLimit: number | null;
}

export interface PlayerState {
    id: string;
    score: number;
    powersLeft: Power[];
}

export type Phase = 1 | 2;

export interface VeDichState {
    // The rulebook's numbers, frozen when the round opened.
    rules: VeDichRules;
    phase: Phase;
    players: PlayerState[];
    /** What can still be picked RIGHT NOW: phase 1 holds only the 20/30 cells. */
    remaining: VeDichQuestion[];
    /** The 40/50 cells, held back from Chung — merged into `remaining` at
     *  phase 2 together with the unplayed 20/30s (the summit's full pool).
     *  Optional: states stored before this rule lack it (read as none). */
    deferred?: VeDichQuestion[];
    turnIndex: number;
    pendingPicks: VeDichQuestion[];
    open: OpenQuestion | null;
    buzzOpenedAt: string | null;   // ISO time the buzz window opened
    /**
     * The console's power decision for the turn — made on the pick board BEFORE
     * the question opens (the show's rule: star / assign / none). Staged, not
     * yet spent: `openPhase2Question` spends it and applies it; a turn change
     * (advanceTurn) clears it unspent. Optional on pre-reveal states.
     */
    stagedPower?: StagedPower | null;
    /**
     * At most ONE power may be SPENT per turn (the show's cap): set when a
     * question opens with a staged power, cleared when the turn advances. The
     * player's other power stays theirs for a later turn. Optional.
     */
    turnPowerUsed?: boolean;
    /**
     * The operator ended the race: the clock stops and EVERY buzz is locked out
     * from here on, whatever the time limit says. Optional — states written
     * before the lock existed carry none.
     */
    buzzLocked?: boolean;
    ended: boolean;
    /**
     * The console's Hiện đáp án: the question whose CORRECT ANSWER every screen
     * is showing. Display-only; the view exposes the text only while that
     * question is still open. Optional on pre-reveal states.
     */
    revealedAnswer?: string | null;
}

/** A staged (pre-open) power decision: what the question will open with. */
export interface StagedPower {
    power: Power;
    targetId?: string;
}

export interface OpenQuestion {
    question: VeDichQuestion;
    answerer: string;              // current player's id
    power: Power | null;           // STAR: applies to the answerer. ASSIGN: the duel
    stage: "current" | "buzz";     // current answers first, then buzz window
    buzzer: string | null;         // set when a buzzer wins the window
    /** How fast that buzz was, in ms from the window opening. Optional: states
     *  written before the time was kept carry none. */
    buzzerMs?: number | null;
    /**
     * ASSIGN only: the player the question was handed to. Set when the current
     * player declares ASSIGN — the same call that opens the race, since in a
     * duel there is nobody to "answer first". Optional on the type so archived
     * states (which never had it) still read.
     */
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
    // The board is fixed: 6×20, 6×30, 4×40, 4×50. Refuse anything else rather
    // than draw a board the show never agreed to.
    const diffs = compositionDiffs(questions);
    if (diffs.length > 0) {
        fail("BOARD_COMPOSITION", `ve-dich needs 6×20, 6×30, 4×40, 4×50 — got ${diffs.join(", ")}`);
    }

    // Chung plays the 20s and 30s ONLY; the 40s and 50s wait for the summit
    // and join it together with whatever 20/30 cells Chung never reached.
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

// Phase 1 is complete once no question is open and every player has had a turn.
export function phase1Complete(state: VeDichState): boolean {
    return state.phase === 1 && state.open === null && state.turnIndex >= state.players.length;
}

/**
 * Phase 1 recorded NOTHING — the console may skip it (Về đích · Riêng starts the
 * summit on untouched scores, the confirmed rule). Any completed turn or open
 * question keeps PHASE1_INCOMPLETE guarding: finish phase 1 first.
 */
export function phase1Untouched(state: VeDichState): boolean {
    return state.phase === 1 && state.turnIndex === 0 && state.open === null && state.pendingPicks.length === 0;
}

export function phase2Complete(state: VeDichState): boolean {
    return state.phase === 2 && state.open === null && state.turnIndex >= state.players.length;
}

// Move to phase 2. The turn order is fixed HERE, by score at this moment (lowest first).
export function beginPhase2(state: VeDichState): VeDichState {
    if (state.phase !== 1) fail("WRONG_PHASE", "already in phase 2");
    if (!phase1Complete(state) && !phase1Untouched(state)) fail("PHASE1_INCOMPLETE", "phase 1 is not complete");
    return {
        ...state,
        phase: 2,
        // The summit's pool = every cell Chung didn't play (20/30 leftovers)
        // PLUS the deferred 40/50s. `?? []` carries pre-rule archives, which
        // stored no deferred list (their remaining already held everything).
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

// Phase 1: the current player picks one question — EITHER band: the show lets
// the desk pick any free 20- or 30-point cell, in any order (no top-band rule).
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
    // Chung is a 20/30 table by rule — guards pre-rule archived states too,
    // where remaining may still list the big cells.
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
/**
 * The power decision — PRE-OPEN ONLY. PLAYERS CANNOT DECLARE: the console
 * stages it on the pick board before Bắt đầu opens the question (the show's
 * row: star / assign / none). Nothing is spent until the question opens with
 * it; a turn change clears an unspent staging. `power: null` is the explicit
 * "Không dùng quyền năng" — it clears a staged choice.
 */
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
    if (power === null) return { ...state, stagedPower: null };

    // One power per turn: this turn already spent one — the player's OTHER
    // power stays theirs for a later turn.
    if (state.turnPowerUsed === true) {
        fail("ONE_POWER_PER_TURN", "only one power may be used per turn");
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
        return { ...state, stagedPower: { power, targetId } };
    }
    return { ...state, stagedPower: { power } };
}

// Phase 2 opens the question for the current player. Declaration happens here,
// then the answer is recorded and the buzz window opens.
export function openPhase2Question(state: VeDichState, questionId: string, nowIso?: string): VeDichState {
    if (state.phase !== 2) fail("WRONG_PHASE", "openPhase2Question only applies in Phase 2");
    if (state.open) fail("ALREADY_OPEN", "a question is already open");

    const question = state.pendingPicks.find((q) => q.id === questionId);
    if (!question) fail("INVALID_QUESTION", `question ${questionId} is not one of this turn's picks`);

    // The staged decision lands with the question: SPEND it here (the show's
    // rule: a power is spent the moment the question opens with it) and apply
    // it. An ASSIGN opens the race at once — nobody answers first.
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
        // One power per turn: spending one here caps the rest of this turn.
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

// The current player's answer has been recorded and judged later. The buzz window opens now
// regardless of correctness, per the rules. Buzzes are resolved by the server receive order;
// the caller passes the first buzzer, and later buzzes are rejected by this function.
export function closeCurrentAnswer(state: VeDichState, openedAt: string): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.phase !== 2) return state;      // Phase 1 has no buzz window
    if (state.open.stage !== "current") fail("ALREADY_OPEN", "the buzz window already happened");

    return { ...state, open: { ...state.open, stage: "buzz" }, buzzOpenedAt: openedAt, buzzLocked: false };
}

// How long the window stays open, in seconds. A normal buzz window is the
// round's `buzzWindowS` (5 s). An ASSIGN race runs on the QUESTION's own time
// limit — the duel lasts as long as the question does.
export function buzzWindowSeconds(state: VeDichState): number {
    if (state.open?.power === "ASSIGN") {
        return state.open.question.timeLimit ?? state.rules.buzzWindowS;
    }
    return state.rules.buzzWindowS;
}

/**
 * END THE RACE. The operator stops the clock and BOTH halves of a duel are
 * locked out — nothing is scored here: the question then resolves as the
 * nobody-buzzed case (both lose 50%). Also usable on a normal question, where it
 * simply skips the rest of the 5 s window.
 */
export function lockBuzzWindow(state: VeDichState): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    if (state.open.stage !== "buzz") fail("ALREADY_OPEN", "there is no open buzz window");
    if (state.open.buzzer !== null) fail("ALREADY_OPEN", "someone already buzzed — the race is settled");
    return { ...state, buzzLocked: true };
}

// Is the buzz window open at `nowIso`?
export function isBuzzOpen(state: VeDichState, nowIso: string): boolean {
    if (state.buzzLocked === true) return false;      // the operator ended it
    if (state.open === null || state.open.stage !== "buzz" || state.buzzOpenedAt === null) {
        return false;
    }
    const elapsed = Date.parse(nowIso) - Date.parse(state.buzzOpenedAt);
    return elapsed >= 0 && elapsed <= buzzWindowSeconds(state) * 1000;
}

// Who may buzz at all: on a normal question everyone except the answerer; on an
// ASSIGN question ONLY the two halves of the duel.
export function mayBuzz(state: VeDichState, playerId: string): boolean {
    if (state.open === null) return false;
    const assignedTo = state.open.assignedTo ?? null;
    if (assignedTo !== null) {
        return playerId === state.open.answerer || playerId === assignedTo;
    }
    return playerId !== state.open.answerer;
}

// The buzz. `nowIso` is REQUIRED: the window is a RULE, not a UI courtesy — a
// buzz that arrives after buzzWindowS is refused here, so a slow player cannot
// steal the question by posting late (the view hides the button; this enforces).
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
            // The race is a stopwatch: keep the time that decided it.
            buzzerMs: state.buzzOpenedAt === null
                ? 0
                : Math.max(0, Date.parse(nowIso) - Date.parse(state.buzzOpenedAt))
        }
    };
}

export interface Verdicts {
    answerer: boolean;          // current player correct?
    buzzer?: boolean;           // buzzer correct? (only if someone buzzed)
}

// Finish the question. Two shapes:
//
//   normal — the answerer scores on their own answer (STAR/plain multipliers),
//            and a buzzer, if any, scores on theirs. Independent.
//   ASSIGN — a DUEL between the answerer and the player they handed it to. Only
//            one of them answered (the faster buzz); nobody buzzed at all is a
//            legitimate ending, and both halves lose 50%.
export function resolveQuestion(state: VeDichState, verdicts: Verdicts): VeDichState {
    if (!state.open) fail("NOTHING_OPEN", "no question is open");
    const { open } = state;
    const assignedTo = open.assignedTo ?? null;

    // A duel may be resolved with nobody buzzing; everything else may not.
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

// An ASSIGN duel: the buzzer takes +100% when right / −50% when wrong, and the
// other half of the pair takes −50% only when the buzzer was right. Nobody
// buzzing costs both halves 50%.
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
    // A new turn = a new decision: any staged power dies unspent here, and the
    // one-power-per-turn cap lifts with the turn it belonged to.
    return { ...state, turnIndex: next, pendingPicks: [], stagedPower: null, turnPowerUsed: false };
}

export { veDichPoints };
