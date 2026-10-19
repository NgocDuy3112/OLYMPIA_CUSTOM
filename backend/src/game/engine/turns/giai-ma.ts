// giai-ma: MC-chosen hints (shared pool) and keyword submissions.
// Hint identity IS the MatchQuestion _id, so facts attach to a question row directly.
import { keywordValue } from "../scoring/giai-ma.js";
import { fail } from "./errors.js";

export type Stage = "hints" | "ended";

// The answer window after the MC opens a hint.
export const HINT_WINDOW_S = 15;

export interface GiaiMaPlayer {
    id: string;
    hintsRevealed: number;      // count of this player's correct hint answers
    revealed: string[];         // hint question ids revealed to this player (private)
    keywordLocked: boolean;     // true once the player submitted a keyword
    keywordPoints: number;      // points earned from the keyword, 0 until submitted
    eliminated: boolean;        // wrong keyword submission
}

export interface GiaiMaState {
    stage: Stage;
    players: GiaiMaPlayer[];
    hintIds: string[];          // all hint question ids, in display order
    picked: string[];           // hint ids the MC has picked, in pick order
    openHint: string | null;    // the hint whose answer window is open, or null
    openHintAt: string | null;  // ISO time the window opened
}

export function startGiaiMa(playerIds: string[], hintIds: string[]): GiaiMaState {
    return {
        stage: "hints",
        players: playerIds.map((id) => ({
            id,
            hintsRevealed: 0,
            revealed: [],
            keywordLocked: false,
            keywordPoints: 0,
            eliminated: false
        })),
        hintIds: [...hintIds],
        picked: [],
        openHint: null,
        openHintAt: null
    };
}

// Hints not yet picked, in display order.
export function remainingHints(state: GiaiMaState): string[] {
    const picked = new Set(state.picked);
    return state.hintIds.filter((id) => !picked.has(id));
}

export function keywordValueFor(state: GiaiMaState, playerId: string): number {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) fail("UNKNOWN_PLAYER", `player ${playerId} is not in giai-ma`);
    return keywordValue(player.hintsRevealed);
}

// The MC opens the answer window for one hint. Only one window may be open at a time.
export function openHint(state: GiaiMaState, hintId: string, openedAt: string): GiaiMaState {
    if (state.stage !== "hints") fail("WRONG_STAGE", "hints are over");
    if (state.openHint !== null) fail("WINDOW_OPEN", `hint ${state.openHint} is already open`);
    if (!remainingHints(state).includes(hintId)) {
        fail("HINT_CONSUMED", `hint ${hintId} is not available`);
    }
    return { ...state, openHint: hintId, openHintAt: openedAt };
}

// Is the hint window open, and still within its 15 seconds, at `nowIso`?
export function isWindowOpen(state: GiaiMaState, nowIso: string): boolean {
    if (state.openHint === null || state.openHintAt === null) return false;
    const elapsed = Date.parse(nowIso) - Date.parse(state.openHintAt);
    return elapsed >= 0 && elapsed <= HINT_WINDOW_S * 1000;
}

// May this player submit an answer for the open hint right now?
// A locked (keyword-submitted) or eliminated player may not.
export function canPlayerAnswer(state: GiaiMaState, playerId: string, nowIso: string): boolean {
    if (!isWindowOpen(state, nowIso)) return false;
    const player = state.players.find((p) => p.id === playerId);
    return player !== undefined && !player.keywordLocked && !player.eliminated;
}

// The MC closes the window without resolving it. The hint stays available.
export function closeHintWindow(state: GiaiMaState): GiaiMaState {
    if (state.openHint === null) fail("NO_OPEN_HINT", "no hint window is open");
    return { ...state, openHint: null, openHintAt: null };
}

// The MC resolves the open hint. Every player who answered correctly is revealed the
// hint; a player with no answer, or a wrong one, gets nothing. The hint is consumed
// either way, and the window closes.
export function resolveOpenHint(
    state: GiaiMaState,
    answers: Record<string, boolean>
): GiaiMaState {
    if (state.stage !== "hints") fail("WRONG_STAGE", "hints are over");
    if (state.openHint === null) fail("NO_OPEN_HINT", "no hint window is open");

    const hint = state.openHint;
    const players = state.players.map((p) => {
        if (p.keywordLocked || answers[p.id] !== true) return p;
        return {
            ...p,
            hintsRevealed: p.hintsRevealed + 1,
            revealed: [...p.revealed, hint]
        };
    });

    const picked = [...state.picked, hint];
    const next: GiaiMaState = { ...state, players, picked, openHint: null, openHintAt: null };
    return remainingHints(next).length === 0 ? { ...next, stage: "ended" } : next;
}

// Keyword submission, allowed any time during the hint phase. Locks the player's value.
// Correct: earns the locked value. Wrong: 0 and eliminated. Either way they stop
// participating in hints.
export function submitKeyword(
    state: GiaiMaState,
    playerId: string,
    correct: boolean
): GiaiMaState {
    if (state.stage !== "hints") fail("WRONG_STAGE", "giai-ma is over");
    const player = state.players.find((p) => p.id === playerId);
    if (!player) fail("UNKNOWN_PLAYER", `player ${playerId} is not in giai-ma`);
    if (player.keywordLocked) fail("ALREADY_SUBMITTED", "this player already submitted a keyword");

    const players = state.players.map((p) =>
        p.id === playerId
            ? {
                  ...p,
                  keywordLocked: true,
                  keywordPoints: correct ? keywordValue(p.hintsRevealed) : 0,
                  eliminated: !correct
              }
            : p
    );

    const everyoneDone = players.every((p) => p.keywordLocked);
    return { ...state, players, stage: everyoneDone ? "ended" : state.stage };
}

export function giaiMaPoints(state: GiaiMaState, playerId: string): number {
    return state.players.find((p) => p.id === playerId)?.keywordPoints ?? 0;
}

// Ends the round (the MC closes it); unsubmitted players earn nothing.
export function endGiaiMa(state: GiaiMaState): GiaiMaState {
    if (state.stage === "ended") return state;
    return { ...state, stage: "ended" };
}
