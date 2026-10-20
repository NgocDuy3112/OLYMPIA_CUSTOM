import { describe, expect, it } from "vitest";
import { advancing, rankQualification } from "../../../src/modules/progression/qualification.js";
import { ProgressionError } from "../../../src/game/contracts/index.js";

const s = (userId: string, score: number) => ({ userId, score });

describe("phase 1 ranking — the second point system breaks ties", () => {
    it("ranks distinct scores with no gaps", () => {
        const { rows, unresolved } = rankQualification([s("a", 30), s("b", 20), s("c", 10)]);
        expect(unresolved).toEqual([]);
        expect(rows).toEqual([
            { userId: "a", score: 30, rank: 1 },
            { userId: "b", score: 20, rank: 2 },
            { userId: "c", score: 10, rank: 3 }
        ]);
    });

    it("holds a tied group back when nothing else separates it", () => {
        const { rows, unresolved } = rankQualification([s("a", 30), s("b", 30), s("c", 10)]);
        expect(unresolved).toEqual([["a", "b"]]);
        expect(rows).toEqual([{ userId: "c", score: 10, rank: 1 }]);
    });

    it("separates a tie by the secondary score — no tie-break turn needed", () => {
        const { rows, unresolved } = rankQualification(
            [s("a", 30), s("b", 30), s("c", 10)],
            { secondaryScores: { a: 5, b: 9 } }
        );
        expect(unresolved).toEqual([]);
        const byUser = Object.fromEntries(rows.map((r) => [r.userId, r.rank]));
        expect(byUser).toEqual({ b: 1, a: 2, c: 3 });
    });

    it("falls back to an explicit order when primary and secondary both tie", () => {
        const { rows, unresolved } = rankQualification(
            [s("a", 30), s("b", 30)],
            {
                secondaryScores: { a: 5, b: 5 },
                tieBreaks: [{ players: ["a", "b"], order: ["b", "a"] }]
            }
        );
        expect(unresolved).toEqual([]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["b", "a"]);
    });

    it("rejects an order for players who are not actually tied", () => {
        // The secondary scores differ, so these two are already separated.
        expect(() => rankQualification(
            [s("a", 30), s("b", 30)],
            { secondaryScores: { a: 1, b: 2 }, tieBreaks: [{ players: ["a", "b"], order: ["a", "b"] }] }
        )).toThrow(ProgressionError);
    });

    it("handles empty fields and single players", () => {
        expect(rankQualification([])).toEqual({ rows: [], unresolved: [] });
        expect(rankQualification([s("a", 0)])).toEqual({
            rows: [{ userId: "a", score: 0, rank: 1 }],
            unresolved: []
        });
    });

    it("rejects a tie-break naming an unknown player", () => {
        expect(() => rankQualification([s("a", 10), s("b", 10)], {
            tieBreaks: [{ players: ["a", "zzz"], order: ["a", "zzz"] }]
        })).toThrow(ProgressionError);
    });
});

describe("the advance cut", () => {
    it("blocks a tie that straddles the cut", () => {
        const { unresolved } = rankQualification(
            [s("a", 30), s("b", 10), s("c", 10), s("d", 10)],
            { advance: 2 }
        );
        expect(unresolved).toEqual([["b", "c", "d"]]);
    });

    it("orders a tie entirely below the cut without blocking", () => {
        const { rows, unresolved } = rankQualification(
            [s("a", 30), s("b", 20), s("c", 10), s("d", 10)],
            { advance: 2 }
        );
        expect(unresolved).toEqual([]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["a", "b", "c", "d"]);
    });

    it("a secondary score resolves a tie that straddles the cut", () => {
        const { rows, unresolved } = rankQualification(
            [s("a", 30), s("b", 10), s("c", 10)],
            { advance: 2, secondaryScores: { b: 1, c: 2 } }
        );
        expect(unresolved).toEqual([]);
        expect(rows.sort((x, y) => x.rank - y.rank).map((r) => r.userId)).toEqual(["a", "c", "b"]);
    });
});

describe("advancing", () => {
    it("takes the top N in rank order", () => {
        const { rows } = rankQualification(
            [s("a", 30), s("b", 30), s("c", 20)],
            { secondaryScores: { a: 2, b: 1 } }
        );
        expect(advancing({ rows, unresolved: [] }, 2)).toEqual(["a", "b"]);
    });

    it("returns fewer than requested when the field is small", () => {
        const { rows } = rankQualification([s("a", 1)]);
        expect(advancing({ rows, unresolved: [] }, 16)).toEqual(["a"]);
    });
});
