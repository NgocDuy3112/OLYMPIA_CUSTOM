import { describe, expect, it } from "vitest";
import {
    AOC_ROUNDS,
    aocRoundConfig,
    isAocRound
} from "../../../src/game/engine/aoc-rulebook.js";
import {
    BUT_PHA_DEFAULTS,
    GIAI_MA_DEFAULTS,
    KHOI_DONG_DEFAULTS,
    VE_DICH_DEFAULTS,
    butPhaRules,
    giaiMaRules,
    khoiDongRules,
    veDichRules
} from "../../../src/game/engine/rules.js";


describe("the four AOC rounds", () => {
    it("are the rounds the deck has modules for, in playing order", () => {
        expect(AOC_ROUNDS.map((round) => round.id)).toEqual(["khoi-dong", "giai-ma", "but-pha", "ve-dich"]);
        expect(AOC_ROUNDS.map((round) => round.order)).toEqual([0, 1, 2, 3]);
    });

    it("each has a canonical rulebook entry", () => {
        for (const round of AOC_ROUNDS) {
            expect(aocRoundConfig(round.id)).not.toBeNull();
            expect(isAocRound(round.id)).toBe(true);
        }
    });

    it("knows nothing about a round it cannot play", () => {
        expect(aocRoundConfig("khong-ton-tai")).toBeNull();
        expect(isAocRound("khong-ton-tai")).toBe(false);
    });
});

describe("the canonical rules resolve to the engine's defaults", () => {
    it("khởi động: six oral runs, six timed questions", () => {
        const rules = khoiDongRules(aocRoundConfig("khoi-dong") ?? undefined);
        expect(rules.phase1Questions).toBe(KHOI_DONG_DEFAULTS.phase1Questions);
        expect(rules.phase1BudgetS).toBe(KHOI_DONG_DEFAULTS.phase1BudgetS);
        expect(rules.phase2Questions).toBe(KHOI_DONG_DEFAULTS.phase2Questions);
        expect(rules.phase2WindowS).toBe(KHOI_DONG_DEFAULTS.phase2WindowS);
        expect(rules.pointsPerCorrect).toBe(KHOI_DONG_DEFAULTS.pointsPerCorrect);
    });

    it("giải mã: eight hints, keyword 100 → 20", () => {
        const rules = giaiMaRules(aocRoundConfig("giai-ma") ?? undefined);
        expect(rules.hintCount).toBe(GIAI_MA_DEFAULTS.hintCount);
        expect(rules.hintWindowS).toBe(GIAI_MA_DEFAULTS.hintWindowS);
        expect(rules.start).toBe(GIAI_MA_DEFAULTS.start);
        expect(rules.dropPerHint).toBe(GIAI_MA_DEFAULTS.dropPerHint);
        expect(rules.floor).toBe(GIAI_MA_DEFAULTS.floor);
    });

    it("bứt phá: four questions on the speed bands", () => {
        const rules = butPhaRules(aocRoundConfig("but-pha") ?? undefined);
        expect(rules.questionCount).toBe(BUT_PHA_DEFAULTS.questionCount);
        expect(rules.questionLimitS).toBe(BUT_PHA_DEFAULTS.questionLimitS);
        expect(rules.bands).toEqual(BUT_PHA_DEFAULTS.bands);
        expect(rules.multipliers).toEqual(BUT_PHA_DEFAULTS.multipliers);
        expect(rules.lateMultiplier).toBe(BUT_PHA_DEFAULTS.lateMultiplier);
    });

    it("về đích: ±100% / −50%, STAR ×1.5, three picks", () => {
        const rules = veDichRules(aocRoundConfig("ve-dich") ?? undefined);
        expect(rules.correctPct).toBe(VE_DICH_DEFAULTS.correctPct);
        expect(rules.incorrectPct).toBe(VE_DICH_DEFAULTS.incorrectPct);
        expect(rules.star).toEqual(VE_DICH_DEFAULTS.star);
        expect(rules.buzzWindowS).toBe(VE_DICH_DEFAULTS.buzzWindowS);
        expect(rules.pickCount).toBe(VE_DICH_DEFAULTS.pickCount);
    });
});

describe("the question kinds each round accepts", () => {
    it("matches what its engine deals in", () => {
        expect(aocRoundConfig("khoi-dong")?.allowedKinds).toEqual(["TEXT"]);
        expect(aocRoundConfig("giai-ma")?.allowedKinds).toEqual(["KEYWORD", "HINT"]);
        expect(aocRoundConfig("but-pha")?.allowedKinds).toEqual(["TEXT"]);
        expect(aocRoundConfig("ve-dich")?.allowedKinds).toEqual(["TEXT"]);
    });
});
