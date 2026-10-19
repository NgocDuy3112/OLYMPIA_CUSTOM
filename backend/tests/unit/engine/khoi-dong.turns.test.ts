import { describe, expect, it } from "vitest";
import {
    answerPhase1,
    closePhase2,
    phase1Total,
    phase2Points,
    startPhase1,
    startPhase2,
    submitPhase2,
    timeOutPhase1
} from "../../../src/game/engine/turns/khoi-dong.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

const IDS6 = ["q1", "q2", "q3", "q4", "q5", "q6"];

function codeOf(fn: () => unknown): string {
    try { fn(); } catch (e) {
        if (e instanceof RuleError) return e.code;
        throw e;
    }
    return "NO_ERROR";
}

describe("khoi-dong phase 1 (oral, sequential, 45 s)", () => {
    it("requires exactly 6 questions", () => {
        expect(codeOf(() => startPhase1(["a", "b"]))).toBe("VALIDATION");
    });

    it("6 correct answers within the budget: 60 points", () => {
        let s = startPhase1(IDS6);
        for (let i = 0; i < 6; i++) s = answerPhase1(s, { correct: true, spentS: 5 });
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(60);
    });

    it("wrong answers score 0 but still use the clock and move on", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 5 });
        s = answerPhase1(s, { correct: false, spentS: 5 });
        expect(s.cursor).toBe(2);
        expect(phase1Total(s)).toBe(10);
    });

    it("the 45 s budget is shared across the whole phase", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 20 });
        s = answerPhase1(s, { correct: true, spentS: 20 });
        expect(s.elapsedS).toBe(40);
        expect(s.ended).toBe(false);
    });

    it("an answer that runs past 45 s is not counted and ends the phase", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 30 });
        s = answerPhase1(s, { correct: true, spentS: 20 });  // would total 50
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(10);                     // only the first answer counts
    });

    it("timing out between questions ends the phase; unasked questions score 0", () => {
        let s = startPhase1(IDS6);
        s = answerPhase1(s, { correct: true, spentS: 5 });
        s = timeOutPhase1(s);
        expect(s.ended).toBe(true);
        expect(phase1Total(s)).toBe(10);
    });

    it("cannot answer after the phase has ended", () => {
        let s = timeOutPhase1(startPhase1(IDS6));
        expect(codeOf(() => answerPhase1(s, { correct: true, spentS: 1 }))).toBe("PHASE_ENDED");
    });
});

describe("khoi-dong phase 2 (typed, simultaneous, 60 s)", () => {
    const SET = ["p1", "p2", "p3", "p4", "p5", "p6"];

    it("is a separate question set from phase 1 (validated by caller; set size enforced)", () => {
        expect(codeOf(() => startPhase2(["x"]))).toBe("VALIDATION");
    });

    it("all players answer the same set at once; each scores independently", () => {
        let s = startPhase2(SET);
        s = submitPhase2(s, { playerId: "a", questionId: "p1", correct: true, atS: 10 });
        s = submitPhase2(s, { playerId: "a", questionId: "p2", correct: true, atS: 12 });
        s = submitPhase2(s, { playerId: "b", questionId: "p1", correct: true, atS: 5 });
        expect(phase2Points(s, "a")).toBe(20);
        expect(phase2Points(s, "b")).toBe(10);
    });

    it("an answer after 60 s is rejected", () => {
        const s = startPhase2(SET);
        expect(codeOf(() => submitPhase2(s, { playerId: "a", questionId: "p1", correct: true, atS: 61 })))
            .toBe("LATE");
    });

    it("each player answers each question at most once", () => {
        let s = startPhase2(SET);
        s = submitPhase2(s, { playerId: "a", questionId: "p1", correct: true, atS: 3 });
        expect(codeOf(() => submitPhase2(s, { playerId: "a", questionId: "p1", correct: false, atS: 4 })))
            .toBe("ALREADY_ANSWERED");
    });

    it("rejects questions that are not in the phase 2 set", () => {
        const s = startPhase2(SET);
        expect(codeOf(() => submitPhase2(s, { playerId: "a", questionId: "q1", correct: true, atS: 1 })))
            .toBe("INVALID_QUESTION");
    });

    it("no answers after the phase is closed", () => {
        const s = closePhase2(startPhase2(SET));
        expect(codeOf(() => submitPhase2(s, { playerId: "a", questionId: "p1", correct: true, atS: 1 })))
            .toBe("PHASE_ENDED");
    });
});
