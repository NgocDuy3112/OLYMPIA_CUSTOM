import { describe, expect, it } from "vitest";
import {
    closeWindow,
    currentQuestionId,
    endTieBreak,
    finalize,
    nextQuestion,
    openWindow,
    rankWithTieBreak,
    startTieBreak,
    submit,
    tieBreakScore
} from "../../../src/game/engine/turns/tie-break.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

function codeOf(fn: () => unknown): string {
    try { fn(); } catch (e) {
        if (e instanceof RuleError) return e.code;
        throw e;
    }
    return "NO_ERROR";
}

const QUESTIONS = ["tb1", "tb2"];

describe("tie-break — the round mechanism", () => {
    it("needs ≥ 2 distinct players and ≥ 1 question", () => {
        expect(codeOf(() => startTieBreak(["a"], QUESTIONS))).toBe("VALIDATION");
        expect(codeOf(() => startTieBreak(["a", "a"], QUESTIONS))).toBe("VALIDATION");
        expect(codeOf(() => startTieBreak(["a", "b"], []))).toBe("VALIDATION");
        expect(startTieBreak(["a", "b"], QUESTIONS).players).toEqual(["a", "b"]);
    });

    it("submits only through an open window, only for tied players", () => {
        let s = startTieBreak(["a", "b"], QUESTIONS);
        expect(codeOf(() => submit(s, { playerId: "a", text: "42" }))).toBe("WINDOW_CLOSED");

        s = openWindow(s);
        s = submit(s, { playerId: "a", text: "42" });
        expect(codeOf(() => submit(s, { playerId: "c", text: "x" }))).toBe("NOT_A_TIED_PLAYER");

        s = closeWindow(s);
        expect(codeOf(() => submit(s, { playerId: "a", text: "43" }))).toBe("WINDOW_CLOSED");
        expect(s.answers.a.tb1).toEqual({ text: "42", correct: null });
    });

    it("finalizing closes the window and records verdicts; totals never change", () => {
        let s = startTieBreak(["a", "b"], QUESTIONS);
        s = openWindow(s);
        s = submit(s, { playerId: "a", text: "42" });
        s = submit(s, { playerId: "b", text: "41" });
        s = finalize(s, { verdicts: [{ playerId: "a", correct: true }, { playerId: "b", correct: false }] });

        expect(s.open).toBe(false);
        expect(tieBreakScore(s, "a")).toBe(10);   // frozen default: 10 per correct
        expect(tieBreakScore(s, "b")).toBe(0);
        expect(codeOf(() => finalize(s, { verdicts: [] }))).toBe("WINDOW_CLOSED");
    });

    it("walks the questions in order, judging before advancing, then ends", () => {
        let s = startTieBreak(["a", "b"], QUESTIONS);
        expect(currentQuestionId(s)).toBe("tb1");
        expect(codeOf(() => nextQuestion(s))).toBe("QUESTION_IN_PLAY"); // window still closed but unjudged

        s = openWindow(s);
        expect(codeOf(() => nextQuestion(s))).toBe("QUESTION_IN_PLAY");

        s = finalize(s, { verdicts: [{ playerId: "a", correct: true }, { playerId: "b", correct: true }] });
        s = nextQuestion(s);
        expect(currentQuestionId(s)).toBe("tb2");

        // ending with an unjudged question is refused
        s = openWindow(s);
        s = closeWindow(s);
        expect(codeOf(() => endTieBreak(s))).toBe("QUESTIONS_UNJUDGED");

        s = openWindow(s);
        s = finalize(s, { verdicts: [{ playerId: "a", correct: false }, { playerId: "b", correct: true }] });
        s = endTieBreak(s);
        expect(s.ended).toBe(true);
        // a: correct on tb1 only; b: correct on both
        expect(tieBreakScore(s, "a")).toBe(10);
        expect(tieBreakScore(s, "b")).toBe(20);
        expect(codeOf(() => submit(openWindow(s), { playerId: "a", text: "x" }))).toBe("ENDED");
    });

    it("an empty verdict set leaves the question unjudged", () => {
        let s = startTieBreak(["a", "b"], QUESTIONS);
        s = openWindow(s);
        s = finalize(s, { verdicts: [] });
        expect(codeOf(() => nextQuestion(s))).toBe("QUESTION_IN_PLAY");
        expect(codeOf(() => endTieBreak(s))).toBe("QUESTIONS_UNJUDGED");
    });
});

describe("rankWithTieBreak — rank only, totals untouched", () => {
    const entries = [
        { userId: "a", totalScore: 100 },
        { userId: "b", totalScore: 100 },
        { userId: "c", totalScore: 90 }
    ];

    it("without a tie-break, tied totals share the rank (dense, as before)", () => {
        const ranks = rankWithTieBreak(entries, null);
        expect(ranks.get("a")).toBe(1);
        expect(ranks.get("b")).toBe(1);
        expect(ranks.get("c")).toBe(2);
    });

    it("with scores, the tied pair orders and c stays dense behind", () => {
        const ranks = rankWithTieBreak(entries, new Map([["a", 10], ["b", 0]]));
        expect(ranks.get("a")).toBe(1);
        expect(ranks.get("b")).toBe(2);
        expect(ranks.get("c")).toBe(3);
    });

    it("a tie the round did NOT resolve stays shared", () => {
        const ranks = rankWithTieBreak(entries, new Map([["a", 10], ["b", 10]]));
        expect(ranks.get("a")).toBe(1);
        expect(ranks.get("b")).toBe(1);
        expect(ranks.get("c")).toBe(2);
    });

    it("players absent from the map score 0", () => {
        const ranks = rankWithTieBreak(entries, new Map([["a", 5]]));
        expect(ranks.get("a")).toBe(1);
        expect(ranks.get("b")).toBe(2);
        expect(ranks.get("c")).toBe(3);
    });

    it("totals are read, never rewritten", () => {
        rankWithTieBreak(entries, new Map([["b", 999]]));
        expect(entries.map((e) => e.totalScore)).toEqual([100, 100, 90]);
    });
});
