import { describe, expect, it } from "vitest";
import {
    OLYMPIA_SCALE,
    pointsForPlace,
    scaleCoverage
} from "../../../src/game/engine/scoring/placement.js";

const OLYMPIA_PLACEMENT_TIERS = OLYMPIA_SCALE.tiers;

// The tournament's points: what a place is worth.

describe("the Olympia placement scale", () => {
    it("pays the first four places the most", () => {
        expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, 1)).toBe(25);
        expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, 2)).toBe(18);
        expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, 3)).toBe(12);
        expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, 4)).toBe(8);
    });

    it("pays the rest in bands of three", () => {
        for (const place of [5, 6, 7]) {
            expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, place)).toBe(5);
        }
        for (const place of [8, 9, 10]) {
            expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, place)).toBe(3);
        }
        for (const place of [11, 12, 13]) {
            expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, place)).toBe(2);
        }
        for (const place of [14, 15, 16]) {
            expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, place)).toBe(1);
        }
    });

    it("pays nothing when the tournament has no scale", () => {
        expect(pointsForPlace([], 1)).toBe(0);
        expect(pointsForPlace(null, 1)).toBe(0);
        expect(pointsForPlace(undefined, 16)).toBe(0);
    });

    it("pays nothing outside the scale", () => {
        expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, 17)).toBe(0);
        expect(pointsForPlace(OLYMPIA_PLACEMENT_TIERS, 0)).toBe(0);
    });

    it("covers every place of a field of sixteen, once", () => {
        const covered = OLYMPIA_PLACEMENT_TIERS.flatMap((tier) =>
            Array.from({ length: tier.max - tier.min + 1 }, (_, index) => tier.min + index));
        expect(covered).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    });

    it("never pays a lower place more than a higher one", () => {
        const paid = Array.from({ length: 16 }, (_, index) =>
            pointsForPlace(OLYMPIA_PLACEMENT_TIERS, index + 1));
        for (let i = 1; i < paid.length; i++) {
            expect(paid[i]).toBeLessThanOrEqual(paid[i - 1]);
        }
    });
});

describe("the coverage of a scale", () => {
    const OLYMPIA = OLYMPIA_SCALE.tiers;

    it("covers a field of sixteen exactly", () => {
        const coverage = scaleCoverage(OLYMPIA, 16);
        expect(coverage.places).toBe(16);
        expect(coverage.covered).toBe(16);
        expect(coverage.missing).toEqual([]);
        expect(coverage.beyond).toEqual([]);
    });

    it("reports the places a scale does not cover", () => {
        const coverage = scaleCoverage(OLYMPIA, 20);
        expect(coverage.missing).toEqual([17, 18, 19, 20]);
        expect(coverage.covered).toBe(16);
    });

    it("reports the places a scale reaches past the season", () => {
        const coverage = scaleCoverage(OLYMPIA, 8);
        expect(coverage.missing).toEqual([]);
        expect(coverage.beyond).toEqual([11, 14]);
    });

    it("reports everything as missing when there is no scale", () => {
        const coverage = scaleCoverage([], 3);
        expect(coverage.covered).toBe(0);
        expect(coverage.missing).toEqual([1, 2, 3]);
    });
});
