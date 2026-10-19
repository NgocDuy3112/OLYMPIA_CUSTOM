import { describe, expect, it } from "vitest";
import {
    butPhaTotal,
    closeQuestion,
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
