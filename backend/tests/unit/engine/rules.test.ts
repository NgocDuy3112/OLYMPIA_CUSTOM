import { describe, expect, it } from "vitest";
import {
    butPhaRules,
    giaiMaRules,
    khoiDongRules,
    veDichRules
} from "../../../src/game/engine/rules.js";
import type { RoundConfig } from "../../../src/game/contracts/index.js";

// The rulebook is the source; the format's numbers are the defaults.

const round = (config: Partial<RoundConfig>): RoundConfig => ({
    allowedKinds: ["MC"],
    scoring: { template: "constant", points: 10 },
    turns: [{ id: "phase1", mode: "text", delivery: "batch" }],
    ...config
});

describe("the defaults — the format's numbers", () => {
    it("khoi-dong: two phases of six, 45 s and 60 s, 10 points", () => {
        const rules = khoiDongRules(undefined);
        expect(rules.phase1Questions).toBe(6);
        expect(rules.phase1BudgetS).toBe(45);
        expect(rules.phase2Questions).toBe(6);
        expect(rules.phase2BudgetS).toBe(60);
        expect(rules.pointsPerCorrect).toBe(10);
    });

    it("giai-ma: 8 hints, a 15 s window, a keyword of 100 − 10", () => {
        const rules = giaiMaRules(undefined);
        expect(rules.hintCount).toBe(8);
        expect(rules.hintWindowS).toBe(15);
        expect(rules.start).toBe(100);
        expect(rules.dropPerHint).toBe(10);
        expect(rules.floor).toBe(20);
    });

    it("but-pha: 4 questions of 30 s, bands 15/10/5, ×4/×3/×2", () => {
        const rules = butPhaRules(undefined);
        expect(rules.questionCount).toBe(4);
        expect(rules.questionLimitS).toBe(30);
        expect(rules.bands).toEqual([
            { untilSec: 5, points: 15 },
            { untilSec: 15, points: 10 },
            { untilSec: 30, points: 5 }
        ]);
        expect(rules.multipliers).toEqual([4, 3, 2]);
        expect(rules.lateMultiplier).toBe(1);
    });

    it("ve-dich: +100%/−50%, the powers, a 5 s buzz and 3 picks", () => {
        const rules = veDichRules(undefined);
        expect(rules.correctPct).toBe(1);
        expect(rules.incorrectPct).toBe(-0.5);
        expect(rules.hope).toEqual({ correct: 1.5, incorrect: -1 });
        expect(rules.shield).toEqual({ correct: 0.5, incorrect: 0 });
        expect(rules.buzzWindowS).toBe(5);
        expect(rules.pickCount).toBe(3);
        expect(rules.faceValues.THTH).toBe(20);
        expect(rules.faceValues.KTTH).toBe(50);
    });
});

describe("the rulebook wins", () => {
    it("khoi-dong: the phases' counts and clocks come from the turns", () => {
        const rules = khoiDongRules(round({
            turns: [
                { id: "phase1", mode: "oral", delivery: "sequential", questionCount: 8, timeBudgetSeconds: 30 },
                { id: "phase2", mode: "text", delivery: "batch", questionCount: 10, timeBudgetSeconds: 90 }
            ]
        }));

        expect(rules.phase1Questions).toBe(8);
        expect(rules.phase1BudgetS).toBe(30);
        expect(rules.phase2Questions).toBe(10);
        expect(rules.phase2BudgetS).toBe(90);
    });

    it("khoi-dong: the points come from the constant template", () => {
        const rules = khoiDongRules(round({ scoring: { template: "constant", points: 25 } }));
        expect(rules.pointsPerCorrect).toBe(25);
    });

    it("giai-ma: the keyword comes from the scoring template", () => {
        const rules = giaiMaRules(round({
            scoring: { template: "keyword_derived", initial: 200, dropPerHint: 25, floor: 50, incorrect: 0 },
            turns: [{ id: "hints", mode: "text", delivery: "batch", hintCount: 12, timeLimitSeconds: 20 }]
        }));

        expect(rules.start).toBe(200);
        expect(rules.dropPerHint).toBe(25);
        expect(rules.floor).toBe(50);
        expect(rules.hintCount).toBe(12);
        expect(rules.hintWindowS).toBe(20);
    });

    it("but-pha: the bands and the multipliers come from the scoring template", () => {
        const rules = butPhaRules(round({
            scoring: {
                template: "rank_multiplier",
                bands: [{ untilSec: 3, points: 20 }],
                multipliers: [8, 4],
                ladderTop: 20,
                incorrect: 0,
                timeBasis: "first"
            },
            turns: [{ id: "phase1", mode: "text", delivery: "sequential", questionCount: 6, timeLimitSeconds: 20 }]
        }));

        expect(rules.bands).toEqual([{ untilSec: 3, points: 20 }]);
        expect(rules.multipliers).toEqual([8, 4]);
        expect(rules.lateMultiplier).toBe(4);
        expect(rules.questionCount).toBe(6);
        expect(rules.questionLimitS).toBe(20);
    });

    it("ve-dich: the percentages, the powers and the face values come from the template", () => {
        const rules = veDichRules(round({
            scoring: {
                template: "outcome_multipliers",
                correct: 2,
                incorrect: -1,
                faceValues: { THTH: 10, TNSS: 20 },
                powers: {
                    hope: { correct: 3, incorrect: -2 },
                    shield: { correct: 1, incorrect: 0 }
                }
            },
            turns: [
                { id: "phase1", mode: "text", delivery: "pick", questionCount: 24 },
                { id: "phase2", mode: "oral", delivery: "pick", questionCount: 24, pickCount: 5, buzzWindowSeconds: 8 }
            ]
        }));

        expect(rules.correctPct).toBe(2);
        expect(rules.incorrectPct).toBe(-1);
        expect(rules.hope).toEqual({ correct: 3, incorrect: -2 });
        expect(rules.faceValues).toEqual({ THTH: 10, TNSS: 20 });
        expect(rules.pickCount).toBe(5);
        expect(rules.buzzWindowS).toBe(8);
    });

    it("a rulebook that says nothing about a number keeps the format's", () => {
        // The template is constant, so the keyword numbers are the format's.
        const rules = giaiMaRules(round({ scoring: { template: "constant", points: 10 } }));
        expect(rules.start).toBe(100);
        expect(rules.dropPerHint).toBe(10);
    });
});
