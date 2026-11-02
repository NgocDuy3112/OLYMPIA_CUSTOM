// The tie-break round: when a match would end with tied totals, the MC opens a
// tie-break for the tied players from the WaitingRoom's Tie-break button.
//
// MECHANISM ONLY. The question source is pluggable: startTieBreak receives
// question ids already assembled into the match (where they come from — the
// tag bank, a dedicated set — is decided elsewhere).
//
// The rules, exactly:
//   - tie-break points RANK ONLY — they are added to the TIE-BREAK SCORE, never
//     to a match total. buildMatchResults totals stay untouched;
//   - the MC opens one question at a time, players submit, the MC finalizes
//     verdicts (but-pha style: judging after the window, from the ledger);
//   - when the round ends, the tie-break scores order the tied players, and a
//     tie the round did NOT resolve stays a shared rank — the round breaks ties,
//     it never invents a forced order.
//
// Pure, no I/O — same discipline as the other turn modules.
import { fail } from "./errors.js";

// The round's numbers, frozen when the MC opens it.
export interface TieBreakRules {
    pointsPerCorrect: number;   // what one correct verdict is worth in the tie-break score
}

export const TIE_BREAK_DEFAULTS: TieBreakRules = {
    pointsPerCorrect: 10
};

export interface TieBreakAnswer {
    text: string;
    correct: boolean | null;    // null until the MC finalizes this player's answer
}

export interface TieBreakState {
    rules: TieBreakRules;
    ended: boolean;
    players: string[];                          // the tied players, entry order
    questionIds: string[];                      // the round's questions, in order
    cursor: number;                             // 0-based; the question the MC has open
    open: boolean;                              // the answer window for the current question
    // playerId → questionId → the submission and its verdict.
    answers: Record<string, Record<string, TieBreakAnswer>>;
}

// Open the round for the tied players. The players must be distinct; the
// questions must exist (an empty list is a mis-assembled match, not a round).
export function startTieBreak(
    playerIds: string[],
    questionIds: string[],
    rules: TieBreakRules = TIE_BREAK_DEFAULTS
): TieBreakState {
    if (playerIds.length < 2) fail("VALIDATION", "tie-break needs at least two tied players");
    if (new Set(playerIds).size !== playerIds.length) fail("VALIDATION", "tie-break players must be distinct");
    if (questionIds.length === 0) fail("VALIDATION", "tie-break has no questions");

    const answers: TieBreakState["answers"] = {};
    for (const id of playerIds) answers[id] = {};

    return {
        rules,
        ended: false,
        players: [...playerIds],
        questionIds: [...questionIds],
        cursor: 0,
        open: false,
        answers
    };
}

// The question currently in play.
export function currentQuestionId(state: TieBreakState): string | null {
    if (state.ended) return null;
    return state.questionIds[state.cursor] ?? null;
}

function requireOpen(state: TieBreakState): string {
    if (state.ended) fail("ENDED", "the tie-break has ended");
    const id = currentQuestionId(state);
    if (id === null) fail("NO_QUESTION", "no tie-break question in play");
    if (!state.open) fail("WINDOW_CLOSED", "the tie-break answer window is not open");
    return id;
}

// The MC opens the answer window for the current question.
export function openWindow(state: TieBreakState): TieBreakState {
    if (state.ended) fail("ENDED", "the tie-break has ended");
    if (currentQuestionId(state) === null) fail("NO_QUESTION", "no tie-break question in play");
    if (state.open) return state;
    return { ...state, open: true };
}

// The MC closes the window — submissions stop, judging may begin.
export function closeWindow(state: TieBreakState): TieBreakState {
    if (state.ended) fail("ENDED", "the tie-break has ended");
    if (!state.open) return state;
    return { ...state, open: false };
}

// A player submits an answer while the window is open. Re-submitting replaces
// the previous text — until the MC finalizes, nothing is locked.
export function submit(
    state: TieBreakState,
    params: { playerId: string; text: string }
): TieBreakState {
    const id = requireOpen(state);
    if (!state.players.includes(params.playerId)) {
        fail("NOT_A_TIED_PLAYER", `${params.playerId} is not in this tie-break`);
    }
    return {
        ...state,
        answers: {
            ...state.answers,
            [params.playerId]: {
                ...state.answers[params.playerId],
                [id]: { text: params.text, correct: null }
            }
        }
    };
}

// The MC's final verdicts for the current question — but-pha style, judged
// after the window from what was submitted. Finalizing a player who never
// submitted is allowed: the verdict stands on the MC's call (0 text).
export function finalize(
    state: TieBreakState,
    params: { verdicts: Array<{ playerId: string; correct: boolean }> }
): TieBreakState {
    // Judging happens on the open window — a closed window means this question
    // was already finalized (or never opened): refusing beats silently no-oping.
    if (state.ended) fail("ENDED", "the tie-break has ended");
    const questionId = currentQuestionId(state);
    if (questionId === null) fail("NO_QUESTION", "no tie-break question in play");
    if (!state.open) fail("WINDOW_CLOSED", "the tie-break answer window is not open");

    const closed = closeWindow(state);
    const answers = { ...closed.answers };
    for (const v of params.verdicts) {
        if (!closed.players.includes(v.playerId)) {
            fail("NOT_A_TIED_PLAYER", `${v.playerId} is not in this tie-break`);
        }
        const mine = answers[v.playerId] ?? {};
        const prior = mine[questionId] ?? { text: "", correct: null };
        answers[v.playerId] = { ...mine, [questionId]: { ...prior, correct: v.correct } };
    }
    return { ...closed, answers };
}

// The MC moves to the next question. Every question after the first needs the
// current one judged first — an open verdict would be lost silently.
export function nextQuestion(state: TieBreakState): TieBreakState {
    if (state.ended) fail("ENDED", "the tie-break has ended");
    if (state.cursor + 1 >= state.questionIds.length) {
        fail("NO_MORE_QUESTIONS", "no more tie-break questions");
    }
    const judged = state.players.every((p) =>
        (state.answers[p]?.[currentQuestionId(state) ?? ""]?.correct ?? null) !== null
    );
    if (state.open || !judged) fail("QUESTION_IN_PLAY", "judge the current question first");
    return { ...state, cursor: state.cursor + 1, open: false };
}

// The MC ends the round — only once every question has been judged, so no
// verdict the show relied on is dropped.
export function endTieBreak(state: TieBreakState): TieBreakState {
    if (state.ended) return state;
    if (state.open) fail("WINDOW_OPEN", "close the answer window first");
    const allJudged = state.questionIds.every((qid) =>
        state.players.every((p) => (state.answers[p]?.[qid]?.correct ?? null) !== null)
    );
    if (!allJudged) fail("QUESTIONS_UNJUDGED", "every tie-break question needs its verdicts");
    return { ...state, ended: true };
}

// One player's tie-break score: correct verdicts × the frozen points.
export function tieBreakScore(state: TieBreakState, playerId: string): number {
    const mine = state.answers[playerId] ?? {};
    let correct = 0;
    for (const answer of Object.values(mine)) {
        if (answer.correct === true) correct += 1;
    }
    return correct * state.rules.pointsPerCorrect;
}

// ─── The ranking layer ────────────────────────────────────────────────────────

export interface RankedEntry {
    userId: string;
    totalScore: number;
}

/**
 * Dense-rank match entries by total, breaking tied totals with tie-break
 * scores — rank only: the returned ranks are the only thing that changes, no
 * total is ever rewritten.
 *
 * - higher total first;
 * - on equal totals, higher tie-break score first;
 * - still equal (a tie the round did not resolve, or no tie-break ran) →
 *   the entries SHARE the rank, dense as before.
 *
 * A player absent from `tieBreak` scores 0 — running the round changes nothing
 * for players it was not opened for.
 */
export function rankWithTieBreak(
    entries: RankedEntry[],
    tieBreak: Map<string, number> | null
): Map<string, number> {
    const key = (e: RankedEntry): number => tieBreak?.get(e.userId) ?? 0;
    const sorted = [...entries].sort(
        (a, b) => b.totalScore - a.totalScore || key(b) - key(a)
    );

    const ranks = new Map<string, number>();
    let rank = 0;
    let last: { total: number; tie: number } | null = null;
    for (const entry of sorted) {
        const composite = { total: entry.totalScore, tie: key(entry) };
        if (last === null || composite.total !== last.total || composite.tie !== last.tie) {
            rank += 1;
            last = composite;
        }
        ranks.set(entry.userId, rank);
    }
    return ranks;
}
