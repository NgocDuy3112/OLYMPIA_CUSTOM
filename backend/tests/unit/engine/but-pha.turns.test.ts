import { describe, expect, it } from "vitest";
import {
    butPhaTotal,
    closeQuestion,
    elapsedSeconds,
    openCurrentQuestion,
    startButPha,
    submitAnswer
} from "../../../src/game/engine/turns/but-pha.js";
import { RuleError } from "../../../src/game/engine/turns/errors.js";

function codeOf(fn: () => unknown): string {
    try { fn(); } catch (e) {
        if (e instanceof RuleError) return e.code;
        throw e;
    }
    return "NO_ERROR";
}

const IDS = ["q1", "q2", "q3", "q4"];

describe("but-pha — worked example", () => {
    it("3 s, 7 s, 12 s all correct on one question: 60, 30, 20", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "a", correct: true, atS: 3 });
        s = submitAnswer(s, { playerId: "b", correct: true, atS: 7 });
        s = submitAnswer(s, { playerId: "c", correct: true, atS: 12 });
        expect(butPhaTotal(s, "a")).toBe(60);
        expect(butPhaTotal(s, "b")).toBe(30);
        expect(butPhaTotal(s, "c")).toBe(20);
    });
});

describe("but-pha — sequencing", () => {
    it("requires exactly 4 questions", () => {
        expect(codeOf(() => startButPha(["a"]))).toBe("VALIDATION");
    });

    it("moves through 4 questions then ends", () => {
        let s = startButPha(IDS);
        for (let i = 0; i < 4; i++) s = closeQuestion(s);
        expect(s.ended).toBe(true);
    });

    it("cannot answer after the round has ended", () => {
        let s = startButPha(IDS);
        for (let i = 0; i < 4; i++) s = closeQuestion(s);
        expect(codeOf(() => submitAnswer(s, { playerId: "a", correct: true, atS: 1 })))
            .toBe("ENDED");
    });
});

describe("but-pha — rules", () => {
    it("the speed order resets for each question", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "a", correct: true, atS: 3 });  // q1 order 1: 15×4=60
        s = closeQuestion(s);
        s = submitAnswer(s, { playerId: "b", correct: true, atS: 3 });  // q2 order 1: 15×4=60
        expect(butPhaTotal(s, "a")).toBe(60);
        expect(butPhaTotal(s, "b")).toBe(60);
    });

    it("a wrong answer scores 0 and does not take a speed order", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "a", correct: false, atS: 1 });
        s = submitAnswer(s, { playerId: "b", correct: true, atS: 3 });  // still the 1st correct
        expect(butPhaTotal(s, "a")).toBe(0);
        expect(butPhaTotal(s, "b")).toBe(60);
    });

    it("a correct 4th or later answer earns base × 1", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "a", correct: true, atS: 1 });
        s = submitAnswer(s, { playerId: "b", correct: true, atS: 1 });
        s = submitAnswer(s, { playerId: "c", correct: true, atS: 1 });
        s = submitAnswer(s, { playerId: "d", correct: true, atS: 20 }); // 4th: base 5 × 1
        expect(butPhaTotal(s, "d")).toBe(5);
    });

    it("an answer after 30 s is rejected: scores 0 and takes no speed order", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "late", correct: true, atS: 30.5 });
        s = submitAnswer(s, { playerId: "b", correct: true, atS: 3 });  // still 1st correct
        expect(butPhaTotal(s, "late")).toBe(0);
        expect(butPhaTotal(s, "b")).toBe(60);
    });

    it("an answer at exactly 30 s is in time: base 5 at 1st-correct order ×4 = 20", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "edge", correct: true, atS: 30 });
        expect(butPhaTotal(s, "edge")).toBe(20);
    });

    it("each player answers a question only once", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "a", correct: true, atS: 2 });
        expect(codeOf(() => submitAnswer(s, { playerId: "a", correct: true, atS: 3 })))
            .toBe("ALREADY_ANSWERED");
    });

    it("a question nobody answers correctly awards nothing", () => {
        let s = startButPha(IDS);
        s = submitAnswer(s, { playerId: "a", correct: false, atS: 2 });
        expect(butPhaTotal(s, "a")).toBe(0);
    });
});

describe("but-pha — the per-question clock", () => {
    const NOW = "2026-01-01T00:00:00.000Z";
    const at = (sec: number) => new Date(Date.parse(NOW) + sec * 1000).toISOString();

    it("a fresh round has no clock running", () => {
        expect(startButPha(IDS).questionOpenedAt).toBeNull();
    });

    it("opening the question starts the clock, and it cannot be started twice", () => {
        const open = openCurrentQuestion(startButPha(IDS), NOW);
        expect(open.questionOpenedAt).toBe(NOW);
        expect(codeOf(() => openCurrentQuestion(open, NOW))).toBe("QUESTION_OPEN");
    });

    it("elapsed time is measured from the open moment", () => {
        const open = openCurrentQuestion(startButPha(IDS), NOW);
        expect(elapsedSeconds(open, NOW)).toBe(0);
        expect(elapsedSeconds(open, at(3))).toBe(3);
        expect(elapsedSeconds(open, at(30))).toBe(30);
        expect(elapsedSeconds(open, at(30.5))).toBe(30.5);
    });

    it("elapsed time before the clock starts is an error", () => {
        expect(codeOf(() => elapsedSeconds(startButPha(IDS), NOW))).toBe("QUESTION_NOT_OPEN");
    });

    it("closing a question clears the clock", () => {
        const open = openCurrentQuestion(startButPha(IDS), NOW);
        expect(closeQuestion(open).questionOpenedAt).toBeNull();
    });

    it("an answer at exactly 30 s is accepted; past 30 s is not", () => {
        const open = openCurrentQuestion(startButPha(IDS), NOW);
        const onTime = submitAnswer(open, { playerId: "a", correct: true, atS: 30 });
        expect(butPhaTotal(onTime, "a")).toBe(5 * 4);          // base 5 at 30 s, 1st correct
        const late = submitAnswer(open, { playerId: "b", correct: true, atS: 30.5 });
        expect(butPhaTotal(late, "b")).toBe(0);
    });
});
