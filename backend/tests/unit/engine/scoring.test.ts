import { describe, expect, it } from "vitest";
import { khoiDongPoints } from "../../../src/game/engine/scoring/khoi-dong.js";
import {
    HINT_PENALTY,
    KEYWORD_START,
    keywordAnswerPoints,
    keywordValue
} from "../../../src/game/engine/scoring/giai-ma.js";
import {
    basePointsForTime,
    butPhaPoints,
    speedMultiplier
} from "../../../src/game/engine/scoring/but-pha.js";
import { veDichPoints } from "../../../src/game/engine/scoring/ve-dich.js";

describe("khoi-dong", () => {
    it("awards 10 for a correct answer and 0 otherwise", () => {
        expect(khoiDongPoints(true)).toBe(10);
        expect(khoiDongPoints(false)).toBe(0);
    });
});

describe("giai-ma", () => {
    it("starts at 100 and drops 10 per correct hint", () => {
        expect(KEYWORD_START).toBe(100);
        expect(HINT_PENALTY).toBe(10);
        expect(keywordValue(0)).toBe(100);
        expect(keywordValue(1)).toBe(90);
        expect(keywordValue(2)).toBe(80);
    });

    it("keyword is worth the current value when correct, 0 when wrong", () => {
        expect(keywordAnswerPoints(2, true)).toBe(80);
        expect(keywordAnswerPoints(2, false)).toBe(0);
    });

    it("all 8 hints revealed leaves 20", () => {
        expect(keywordValue(8)).toBe(20);
    });
});

describe("but-pha — base points by time", () => {
    it.each([
        [0, 15],
        [3, 15],
        [4.99, 15],
        [5, 10],
        [10, 10],
        [14.99, 10],
        [15, 5],
        [22, 5],
        [30, 5]
    ])("at %s s the base is %s", (seconds, expected) => {
        expect(basePointsForTime(seconds)).toBe(expected);
    });
});

describe("but-pha — speed multiplier", () => {
    it.each([
        [1, 4],
        [2, 3],
        [3, 2],
        [4, 1],
        [5, 1],
        [12, 1]
    ])("the %sth correct answer gets ×%s", (order, expected) => {
        expect(speedMultiplier(order)).toBe(expected);
    });

    it("rejects an order below 1", () => {
        expect(() => speedMultiplier(0)).toThrow(RangeError);
    });
});

describe("but-pha — points", () => {
    it("worked example: 3s, 7s, 12s all correct on one question", () => {
        expect(butPhaPoints({ correct: true, seconds: 3, order: 1 })).toBe(60);  // 15 × 4
        expect(butPhaPoints({ correct: true, seconds: 7, order: 2 })).toBe(30);  // 10 × 3
        expect(butPhaPoints({ correct: true, seconds: 12, order: 3 })).toBe(20); // 10 × 2
    });

    it("a 4th correct answer earns base × 1", () => {
        expect(butPhaPoints({ correct: true, seconds: 20, order: 4 })).toBe(5);
    });

    it("a wrong answer scores 0 regardless of time or order", () => {
        expect(butPhaPoints({ correct: false, seconds: 1, order: 1 })).toBe(0);
    });
});

describe("ve-dich — percentages on face value", () => {
    it("correct = +100%, wrong = −50%", () => {
        expect(veDichPoints({ faceValue: 30, correct: true })).toBe(30);
        expect(veDichPoints({ faceValue: 30, correct: false })).toBe(-15);
    });

    it("works for every face value 20/30/40/50", () => {
        expect(veDichPoints({ faceValue: 20, correct: true })).toBe(20);
        expect(veDichPoints({ faceValue: 40, correct: false })).toBe(-20);
        expect(veDichPoints({ faceValue: 50, correct: false })).toBe(-25);
    });

    it("HOPE: correct = +150%, wrong = −100%", () => {
        expect(veDichPoints({ faceValue: 30, correct: true, power: "HOPE" })).toBe(45);
        expect(veDichPoints({ faceValue: 30, correct: false, power: "HOPE" })).toBe(-30);
    });

    it("SHIELD: correct = +50%, wrong = 0", () => {
        expect(veDichPoints({ faceValue: 30, correct: true, power: "SHIELD" })).toBe(15);
        expect(veDichPoints({ faceValue: 30, correct: false, power: "SHIELD" })).toBe(0);
    });
});
