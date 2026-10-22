import { describe, expect, it } from "vitest";
import { buildStandings, type MatchResultInput } from "../../../src/game/engine/scoring/standings.js";

// The season's places are decided by how far a player got — never by a sum of points.

const STAGES = [
    { id: "round-1", title: "Round 1" },
    { id: "round-2", title: "Round 2" },
    { id: "final", title: "Final" }
];

const TIERS = [{ min: 1, max: 2, points: 10 }];

const roster = (ids: string[]) => ids.map((userId) => ({ userId, displayName: userId }));

// A match's result: the rank follows the score, the way the engine writes it.
const match = (
    matchId: string,
    stageId: string,
    slot: number | null,
    results: Array<[string, number]>
): MatchResultInput => {
    const sorted = [...results].sort((a, b) => b[1] - a[1]);
    const rankOf = new Map<string, number>();
    let rank = 0;
    let last: number | null = null;
    for (const [userId, score] of sorted) {
        if (last === null || score !== last) {
            rank += 1;
            last = score;
        }
        rankOf.set(userId, rank);
    }

    return {
        matchId,
        stageId,
        slot,
        results: results.map(([userId, totalScore]) => ({
            userId,
            totalScore,
            rank: rankOf.get(userId)!
        }))
    };
};

describe("the season's places", () => {
    it("puts the last stage's players first", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [
                match("m1", "round-1", 1, [["a", 10], ["b", 5]]),
                match("m2", "final", 1, [["c", 30], ["d", 20]])
            ],
            players: roster(["a", "b", "c", "d"]),
            tiers: []
        });

        // The final is the last stage, so its two players take the first two places.
        expect(rows.map((row) => row.userId)).toEqual(["c", "d", "a", "b"]);
        expect(rows.map((row) => row.place)).toEqual([1, 2, 3, 4]);
    });

    it("orders the players inside a stage by the match's slot", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [
                match("m1", "round-1", 2, [["a", 10], ["b", 5]]),
                match("m2", "round-1", 1, [["c", 10], ["d", 5]])
            ],
            players: roster(["a", "b", "c", "d"]),
            tiers: []
        });

        // Slot 1 first, then slot 2 — the slot, not the points, orders them.
        expect(rows.map((row) => row.userId)).toEqual(["c", "d", "a", "b"]);
        expect(rows.map((row) => row.slot)).toEqual([1, 1, 2, 2]);
    });

    it("orders the players inside a match by that match's own rank", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [match("m1", "round-1", 1, [["a", 10], ["b", 30], ["c", 20]])],
            players: roster(["a", "b", "c"]),
            tiers: []
        });

        expect(rows.map((row) => row.userId)).toEqual(["b", "c", "a"]);
        expect(rows.map((row) => row.place)).toEqual([1, 2, 3]);
    });

    it("does not rank by the sum of the points", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [
                // "a" won a big match in an early stage; "b" reached the final and lost it.
                match("m1", "round-1", 1, [["a", 100], ["b", 1]]),
                match("m2", "final", 1, [["b", 1], ["c", 0]])
            ],
            players: roster(["a", "b", "c"]),
            tiers: []
        });

        // "a" scored the most, and is last: the progress decides.
        expect(rows.map((row) => row.userId)).toEqual(["b", "c", "a"]);
    });

    it("shares a place on a tie inside a match, and asks for a tie-break turn", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [{
                matchId: "m1",
                stageId: "final",
                slot: 1,
                // A draw: both players have 10 points, so they share the rank.
                results: [
                    { userId: "a", totalScore: 10, rank: 1 },
                    { userId: "b", totalScore: 10, rank: 1 }
                ]
            }],
            players: roster(["a", "b"]),
            tiers: []
        });

        expect(rows.map((row) => row.place)).toEqual([1, 1]);
        expect(rows[0].tieBreak).toBe("tie — needs a tie-break turn");
    });

    it("lists a player who never played at the bottom, with no place", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [match("m1", "final", 1, [["a", 10]])],
            players: roster(["a", "b"]),
            tiers: []
        });

        expect(rows.map((row) => row.userId)).toEqual(["a", "b"]);
        expect(rows[0].place).toBe(1);
        expect(rows[1].place).toBeNull();
        expect(rows[1].matchesPlayed).toBe(0);
        expect(rows[1].tieBreak).toBe("never played");
    });

    it("ignores a match in a stage the season does not list", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [match("m1", "mystery", 1, [["a", 10]])],
            players: roster(["a"]),
            tiers: []
        });

        expect(rows[0].place).toBeNull();
        expect(rows[0].tieBreak).toBe("never played");
    });

    it("awards the bonus of the place, not of the points", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [
                match("m1", "final", 1, [["a", 3], ["b", 2], ["c", 1]]),
                match("m2", "round-2", 1, [["d", 500]])
            ],
            players: roster(["a", "b", "c", "d"]),
            tiers: TIERS
        });

        expect(rows.map((row) => row.place)).toEqual([1, 2, 3, 4]);
        expect(rows.map((row) => row.placementPoints)).toEqual([10, 10, 0, 0]);
        // "d" scored the most by far, and has the last place.
        expect(rows[3].userId).toBe("d");
    });

    it("says why a row sits below the row above it", () => {
        const rows = buildStandings({
            stages: STAGES,
            matches: [
                match("m1", "final", 1, [["a", 10], ["b", 5]]),
                match("m2", "round-2", 1, [["c", 10]]),
                match("m3", "round-2", 2, [["d", 10]])
            ],
            players: roster(["a", "b", "c", "d"]),
            tiers: []
        });

        expect(rows[0].tieBreak).toBeNull();
        expect(rows[1].tieBreak).toBe("ranked above in the match");
        expect(rows[2].tieBreak).toBe("eliminated earlier");
        expect(rows[3].tieBreak).toBe("slot 1");
    });
});
