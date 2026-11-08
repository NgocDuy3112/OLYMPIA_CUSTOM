import { keywordValue } from "../scoring/giai-ma.js";
import { GIAI_MA_DEFAULTS, type GiaiMaRules } from "../rules.js";
import { fail } from "./errors.js";

export type Stage = "hints" | "ended";

export interface GiaiMaPlayer {
    id: string;
    hintsRevealed: number;      
    revealed: string[];         
    keywordLocked: boolean;     
    keywordPoints: number;      
    eliminated: boolean;        
}

export interface GiaiMaState {
    rules: GiaiMaRules;
    stage: Stage;
    players: GiaiMaPlayer[];
    hintIds: string[];          
    picked: string[];           
    openHint: string | null;    
    openHintAt: string | null;  
    revealedAnswer?: string | null;
}

export function startGiaiMa(
    playerIds: string[],
    hintIds: string[],
    rules: GiaiMaRules = GIAI_MA_DEFAULTS
): GiaiMaState {
    return {
        rules,
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

export function remainingHints(state: GiaiMaState): string[] {
    const picked = new Set(state.picked);
    return state.hintIds.filter((id) => !picked.has(id));
}

export function keywordValueFor(state: GiaiMaState, playerId: string): number {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) fail("UNKNOWN_PLAYER", `player ${playerId} is not in giai-ma`);
    return keywordValue(player.hintsRevealed, state.rules);
}

export function openHint(state: GiaiMaState, hintId: string, openedAt: string): GiaiMaState {
    if (state.stage !== "hints") fail("WRONG_STAGE", "hints are over");
    if (state.openHint !== null) fail("WINDOW_OPEN", `hint ${state.openHint} is already open`);
    if (!remainingHints(state).includes(hintId)) {
        fail("HINT_CONSUMED", `hint ${hintId} is not available`);
    }
    return { ...state, openHint: hintId, openHintAt: openedAt };
}

export function isWindowOpen(state: GiaiMaState, nowIso: string): boolean {
    if (state.openHint === null || state.openHintAt === null) return false;
    const elapsed = Date.parse(nowIso) - Date.parse(state.openHintAt);
    return elapsed >= 0 && elapsed <= state.rules.hintWindowS * 1000;
}

export function canPlayerAnswer(state: GiaiMaState, playerId: string, nowIso: string): boolean {
    if (!isWindowOpen(state, nowIso)) return false;
    const player = state.players.find((p) => p.id === playerId);
    return player !== undefined && !player.keywordLocked && !player.eliminated;
}

export function closeHintWindow(state: GiaiMaState): GiaiMaState {
    if (state.openHint === null) fail("NO_OPEN_HINT", "no hint window is open");
    return { ...state, openHint: null, openHintAt: null };
}

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

export function lockKeyword(state: GiaiMaState, playerId: string): GiaiMaState {
    if (state.stage !== "hints") fail("WRONG_STAGE", "giai-ma is over");
    const player = state.players.find((p) => p.id === playerId);
    if (!player) fail("UNKNOWN_PLAYER", `player ${playerId} is not in giai-ma`);
    if (player.keywordLocked) fail("ALREADY_SUBMITTED", "this player already submitted a keyword");

    const players = state.players.map((p) =>
        p.id === playerId ? { ...p, keywordLocked: true } : p
    );
    return { ...state, players };
}

export function judgeKeyword(state: GiaiMaState, playerId: string, correct: boolean): GiaiMaState {
    const player = state.players.find((p) => p.id === playerId);
    if (!player) fail("UNKNOWN_PLAYER", `player ${playerId} is not in giai-ma`);
    if (!player.keywordLocked) fail("NOT_SUBMITTED", `player ${playerId} has not submitted a keyword`);

    const players = state.players.map((p) =>
        p.id === playerId
            ? {
                  ...p,
                  keywordPoints: correct ? keywordValue(p.hintsRevealed, state.rules) : 0,
                  eliminated: !correct
              }
            : p
    );
    return { ...state, players };
}

export function giaiMaPoints(state: GiaiMaState, playerId: string): number {
    return state.players.find((p) => p.id === playerId)?.keywordPoints ?? 0;
}

export function endGiaiMa(state: GiaiMaState): GiaiMaState {
    if (state.stage === "ended") return state;
    return { ...state, stage: "ended" };
}
