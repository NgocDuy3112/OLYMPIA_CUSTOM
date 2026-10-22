import { describe, expect, it } from "vitest";
import {
    initialLadder,
    ladderNext,
    ladderViolations,
    tierDraw,
    tierOf,
    tierViolations,
    tiersOf
} from "../../../src/game/engine/bracket.js";

// The format's rules, as the engine checks them against what the staff placed.

const FIELD = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11", "p12",
    "p13", "p14", "p15", "p16"];

describe("the tiers", () => {
    it("cuts the ranking into contiguous blocks", () => {
        expect(tiersOf(FIELD, 4)).toEqual([
            ["p1", "p2", "p3", "p4"],
            ["p5", "p6", "p7", "p8"],
            ["p9", "p10", "p11", "p12"],
            ["p13", "p14", "p15", "p16"]
        ]);
    });

    it("knows which tier a player is in", () => {
        const tiers = tierOf(FIELD, 4);
        expect(tiers.get("p1")).toBe(0);
        expect(tiers.get("p4")).toBe(0);
        expect(tiers.get("p5")).toBe(1);
        expect(tiers.get("p16")).toBe(3);
    });

    it("draws one player from each tier into every match", () => {
        const matches = tierDraw(FIELD, 4, 4);
        expect(matches).toHaveLength(4);
        for (const match of matches) {
            expect(match).toHaveLength(4);
            expect(new Set(match.map((id) => tierOf(FIELD, 4).get(id))).size).toBe(4);
        }
        // every player is drawn exactly once
        expect(matches.flat().sort()).toEqual([...FIELD].sort());
    });
});

describe("the tier rule", () => {
    it("accepts a match with one player from each tier", () => {
        const matches = tierDraw(FIELD, 4, 4);
        expect(tierViolations(matches, FIELD, 4)).toEqual([]);
    });

    it("refuses a match with two players from the same tier", () => {
        const problems = tierViolations([["p1", "p2", "p5", "p9"]], FIELD, 4);
        expect(problems.join(" ")).toContain("2 players from tier 0");
        // and the tier it misses is reported too
        expect(problems.join(" ")).toContain("no player from tier 3");
    });

    it("refuses a match that misses a tier", () => {
        const problems = tierViolations([["p1", "p5", "p9", "p10"]], FIELD, 4);
        // p9 and p10 are both in tier 2, and tier 3 is missing
        expect(problems.join(" ")).toContain("2 players from tier 2");
        expect(problems.join(" ")).toContain("no player from tier 3");
    });

    it("refuses a player who is not in the ranking", () => {
        const problems = tierViolations([["p1", "p5", "p9", "stranger"]], FIELD, 4);
        expect(problems.join(" ")).toContain("stranger is not in the ranking");
    });
});

describe("the ladder", () => {
    it("seeds the first round with the blocks of the ranking", () => {
        const round = initialLadder(FIELD, 4);
        expect(round.matches.map((match) => match.slot)).toEqual([1, 2, 3, 4]);
        expect(round.matches[0].order).toEqual(["p1", "p2", "p3", "p4"]);
        expect(round.matches[3].order).toEqual(["p13", "p14", "p15", "p16"]);
    });

    it("climbs the winner and drops the losers", () => {
        // The winner of the match below climbs into the slot above.
        const round = {
            matches: [
                { slot: 1, order: ["a1", "a2", "a3", "a4"] },
                { slot: 2, order: ["b1", "b2", "b3", "b4"] }
            ]
        };
        const step = ladderNext(round, []);

        expect(step.next.matches).toHaveLength(1);
        expect(step.next.matches[0].order).toEqual(["b1", "a2", "a3", "a4"]);
        // the bottom match's losers are out, the top match's winner waits for the finale
        expect(step.eliminated).toEqual(["b2", "b3", "b4"]);
        expect(step.toFinale).toEqual(["a1"]);
    });

    it("accumulates the winners of the top slots for the finale", () => {
        const round = {
            matches: [
                { slot: 1, order: ["a1", "a2", "a3", "a4"] },
                { slot: 2, order: ["b1", "b2", "b3", "b4"] }
            ]
        };
        const step = ladderNext(round, ["previous"]);

        expect(step.toFinale).toEqual(["previous", "a1"]);
    });

    it("refuses a match whose seats are not the ones the ladder puts there", () => {
        const expected = { matches: [{ slot: 1, order: ["b1", "a2", "a3", "a4"] }] };

        expect(ladderViolations(expected, [{ slot: 1, order: ["b1", "a2", "a3", "a4"] }])).toEqual([]);

        const problems = ladderViolations(expected, [{ slot: 1, order: ["b1", "a2", "a3", "x1"] }]);
        expect(problems.join(" ")).toContain("a4 should be in this match");
    });

    it("refuses a match with the wrong number of players", () => {
        const expected = { matches: [{ slot: 1, order: ["b1", "a2", "a3", "a4"] }] };
        const problems = ladderViolations(expected, [{ slot: 1, order: ["b1", "a2"] }]);
        expect(problems.join(" ")).toContain("2 players, the format wants 4");
    });
});
