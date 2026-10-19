import { describe, expect, it } from "vitest";
import { buildMatchResults, denseRanks } from "../../../src/modules/matches/scoring.js";

describe("denseRanks", () => {
    it("equal totals share a rank and the next distinct total takes the next rank", () => {
        const ranks = denseRanks([
            { key: "a", total: 100 },
            { key: "b", total: 90 },
            { key: "c", total: 90 },
            { key: "d", total: 80 }
        ]);
        expect([ranks.get("a"), ranks.get("b"), ranks.get("c"), ranks.get("d")]).toEqual([1, 2, 2, 3]);
    });

    it("everyone tied shares rank 1", () => {
        const ranks = denseRanks([{ key: "a", total: 50 }, { key: "b", total: 50 }]);
        expect([ranks.get("a"), ranks.get("b")]).toEqual([1, 1]);
    });

    it("signed points rank negatives below zero", () => {
        const ranks = denseRanks([
            { key: "a", total: 0 },
            { key: "b", total: -15 },
            { key: "c", total: 10 }
        ]);
        expect([ranks.get("c"), ranks.get("a"), ranks.get("b")]).toEqual([1, 2, 3]);
    });

    it("an empty field has no ranks", () => {
        expect(denseRanks([]).size).toBe(0);
    });
});

describe("buildMatchResults", () => {
    it("sums each competitor's points per round and overall", () => {
        const results = buildMatchResults({
            competitors: [{ userId: "a" }, { userId: "b" }],
            answers: [
                { userId: "a", roundId: "giai-ma", pointsAwarded: 80 },
                { userId: "a", roundId: "but-pha", pointsAwarded: 60 },
                { userId: "b", roundId: "but-pha", pointsAwarded: 30 }
            ]
        });

        const a = results.find((r) => r.userId === "a")!;
        const b = results.find((r) => r.userId === "b")!;
        expect(a).toMatchObject({ kind: "user", totalScore: 140, rank: 1 });
        expect(a.roundScores).toEqual({ "giai-ma": 80, "but-pha": 60 });
        expect(b).toMatchObject({ totalScore: 30, rank: 2 });
        expect(b.roundScores).toEqual({ "but-pha": 30 });
    });

    it("a competitor with no answers gets a zero total", () => {
        const results = buildMatchResults({
            competitors: [{ userId: "a" }, { userId: "b" }],
            answers: [{ userId: "a", roundId: "giai-ma", pointsAwarded: 10 }]
        });
        const b = results.find((r) => r.userId === "b")!;
        expect(b).toMatchObject({ totalScore: 0, roundScores: {} });
    });

    it("signed points are summed as-is", () => {
        const results = buildMatchResults({
            competitors: [{ userId: "a" }],
            answers: [
                { userId: "a", roundId: "ve-dich", pointsAwarded: 50 },
                { userId: "a", roundId: "ve-dich", pointsAwarded: -25 }
            ]
        });
        expect(results[0]).toMatchObject({ totalScore: 25 });
        expect(results[0].roundScores).toEqual({ "ve-dich": 25 });
    });

    it("answers from someone who is not a competitor are ignored", () => {
        const results = buildMatchResults({
            competitors: [{ userId: "a" }],
            answers: [
                { userId: "a", roundId: "giai-ma", pointsAwarded: 10 },
                { userId: "stranger", roundId: "giai-ma", pointsAwarded: 999 }
            ]
        });
        expect(results).toHaveLength(1);
        expect(results[0].totalScore).toBe(10);
    });

    it("is ordered by rank, then user id", () => {
        const results = buildMatchResults({
            competitors: [{ userId: "z" }, { userId: "a" }],
            answers: [
                { userId: "z", roundId: "giai-ma", pointsAwarded: 50 },
                { userId: "a", roundId: "giai-ma", pointsAwarded: 50 }
            ]
        });
        expect(results.map((r) => r.userId)).toEqual(["a", "z"]);
    });
});
