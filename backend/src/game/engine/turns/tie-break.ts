import { fail } from "./errors.js";

export interface TieBreakRules {
    pointsPerCorrect: number;   
}

export const TIE_BREAK_DEFAULTS: TieBreakRules = {
    pointsPerCorrect: 10
};

export interface TieBreakAnswer {
    text: string;
    correct: boolean | null;    
}

export interface TieBreakState {
    rules: TieBreakRules;
    ended: boolean;
    players: string[];                          
    questionIds: string[];                      
    cursor: number;                             
    open: boolean;                              
    answers: Record<string, Record<string, TieBreakAnswer>>;
}

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

export function openWindow(state: TieBreakState): TieBreakState {
    if (state.ended) fail("ENDED", "the tie-break has ended");
    if (currentQuestionId(state) === null) fail("NO_QUESTION", "no tie-break question in play");
    if (state.open) return state;
    return { ...state, open: true };
}

export function closeWindow(state: TieBreakState): TieBreakState {
    if (state.ended) fail("ENDED", "the tie-break has ended");
    if (!state.open) return state;
    return { ...state, open: false };
}

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

export function finalize(
    state: TieBreakState,
    params: { verdicts: Array<{ playerId: string; correct: boolean }> }
): TieBreakState {
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

export function endTieBreak(state: TieBreakState): TieBreakState {
    if (state.ended) return state;
    if (state.open) fail("WINDOW_OPEN", "close the answer window first");
    const allJudged = state.questionIds.every((qid) =>
        state.players.every((p) => (state.answers[p]?.[qid]?.correct ?? null) !== null)
    );
    if (!allJudged) fail("QUESTIONS_UNJUDGED", "every tie-break question needs its verdicts");
    return { ...state, ended: true };
}

export function tieBreakScore(state: TieBreakState, playerId: string): number {
    const mine = state.answers[playerId] ?? {};
    let correct = 0;
    for (const answer of Object.values(mine)) {
        if (answer.correct === true) correct += 1;
    }
    return correct * state.rules.pointsPerCorrect;
}


export interface RankedEntry {
    userId: string;
    totalScore: number;
}

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
