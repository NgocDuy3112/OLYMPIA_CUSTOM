import { describe, expect, it } from "vitest";
import {
    assertValidProgression,
    drawGroups,
    finalPlacements,
    initialLadder,
    ladderNext,
    needsTiebreak,
    orderByTiebreak,
    ProgressionError,
    rankPhase2,
    tiersFor,
    type Rng
} from "../../../src/modules/progression/plan.js";

const RANKED = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);

// Deterministic rng, so a draw is reproducible in tests.
function seeded(seed: number): Rng {
    let s = seed;
    return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
    };
}

describe("progression config", () => {
    it("accepts the canonical 16 into matches of 4", () => {
        expect(() => assertValidProgression({ advance: 16, questionCount: 16, groupSize: 4, splittingRounds: 2, finaleSize: 4 }))
            .not.toThrow();
    });

    it("rejects a field that does not square", () => {
        expect(() => assertValidProgression({ advance: 20, questionCount: 16, groupSize: 4, splittingRounds: 2, finaleSize: 4 }))
            .toThrow(ProgressionError);
        expect(() => assertValidProgression({ advance: 16, questionCount: 16, groupSize: 3, splittingRounds: 2, finaleSize: 3 }))
            .toThrow(ProgressionError);
    });

    it("rejects a finale size the ladder cannot produce", () => {
        expect(() => assertValidProgression({ advance: 16, questionCount: 16, groupSize: 4, splittingRounds: 2, finaleSize: 8 }))
            .toThrow(ProgressionError);
    });
});

describe("rank tiers", () => {
    it("splits 16 into four tiers of four", () => {
        expect(tiersFor(RANKED, 4)).toEqual([
            ["p1", "p2", "p3", "p4"],
            ["p5", "p6", "p7", "p8"],
            ["p9", "p10", "p11", "p12"],
            ["p13", "p14", "p15", "p16"]
        ]);
    });

    it("refuses a field that does not match the tier size", () => {
        expect(() => tiersFor(RANKED.slice(0, 12), 4)).toThrow(ProgressionError);
    });
});

describe("the splitting draw", () => {
    it("puts exactly one player from each tier in every match", () => {
        const groups = drawGroups(RANKED, 4, seeded(7));
        const tiers = tiersFor(RANKED, 4);

        expect(groups).toHaveLength(4);
        for (const group of groups) {
            expect(group).toHaveLength(4);
            for (const tier of tiers) {
                expect(group.filter((id) => tier.includes(id))).toHaveLength(1);
            }
        }
    });

    it("uses every player exactly once", () => {
        const groups = drawGroups(RANKED, 4, seeded(11)).flat().sort();
        expect(groups).toEqual([...RANKED].sort());
    });

    it("is reproducible for a given rng sequence", () => {
        expect(drawGroups(RANKED, 4, seeded(42))).toEqual(drawGroups(RANKED, 4, seeded(42)));
    });

    it("actually shuffles: a different seed gives a different draw", () => {
        expect(drawGroups(RANKED, 4, seeded(1))).not.toEqual(drawGroups(RANKED, 4, seeded(2)));
    });
});

describe("phase 2 ranking", () => {
    it("round 2 decides", () => {
        expect(rankPhase2({ a: 10, b: 90 }, { a: 50, b: 20 })).toEqual(["a", "b"]);
    });

    it("round 1 breaks a round-2 tie", () => {
        expect(rankPhase2({ a: 80, b: 20 }, { a: 30, b: 30 })).toEqual(["a", "b"]);
    });

    it("is deterministic when both rounds tie", () => {
        const once = rankPhase2({ a: 5, b: 5 }, { a: 5, b: 5 });
        const twice = rankPhase2({ a: 5, b: 5 }, { a: 5, b: 5 });
        expect(once).toEqual(twice);
    });

    it("treats a missing round as zero", () => {
        expect(rankPhase2({}, { a: 1, b: 0 })).toEqual(["a", "b"]);
    });
});

describe("the ladder", () => {
    it("seeds the first round in rank blocks", () => {
        const round = initialLadder(RANKED, 4);
        expect(round.matches.map((m) => m.slot)).toEqual([1, 2, 3, 4]);
        expect(round.matches[0].order).toEqual(["p1", "p2", "p3", "p4"]);
        expect(round.matches[3].order).toEqual(["p13", "p14", "p15", "p16"]);
    });

    it("promotes winners, relegates losers, sends the top winner to the finale", () => {
        const step = ladderNext(initialLadder(RANKED, 4));

        expect(step.toFinale).toBe("p1");                       // winner of the top match
        expect(step.eliminated).toEqual(["p14", "p15", "p16"]);  // the bottom match's losers
        expect(step.next.matches).toHaveLength(3);
        expect(step.next.matches[0].order).toEqual(["p5", "p2", "p3", "p4"]);
        expect(step.next.matches[1].order).toEqual(["p9", "p6", "p7", "p8"]);
        expect(step.next.matches[2].order).toEqual(["p13", "p10", "p11", "p12"]);
        expect(step.done).toBe(false);
    });

    it("runs 16 -> 12 -> 8 -> 4 -> done, producing four finalists", () => {
        let round = initialLadder(RANKED, 4);
        const finalists: string[] = [];
        const waves: string[][] = [];

        for (let i = 0; i < 4; i++) {
            const step = ladderNext(round);
            finalists.push(step.toFinale);
            waves.push(step.eliminated);
            round = step.next;
        }

        expect(finalists).toEqual(["p1", "p5", "p9", "p13"]);
        expect(waves).toEqual([
            ["p14", "p15", "p16"],
            ["p10", "p11", "p12"],
            ["p6", "p7", "p8"],
            ["p2", "p3", "p4"]
        ]);
        expect(round.matches).toHaveLength(0);                  // the ladder is exhausted
    });

    it("a single match ends the ladder", () => {
        const step = ladderNext({ matches: [{ slot: 1, order: ["a", "b", "c", "d"] }] });
        expect(step.toFinale).toBe("a");
        expect(step.eliminated).toEqual(["b", "c", "d"]);
        expect(step.done).toBe(true);
        expect(step.next.matches).toEqual([]);
    });

    it("refuses an empty round", () => {
        expect(() => ladderNext({ matches: [] })).toThrow(ProgressionError);
    });
});

describe("final placements", () => {
    it("places the finale first, then waves latest-first", () => {
        const rows = finalPlacements({
            finaleOrder: ["p1", "p5", "p9", "p13"],
            waves: [
                { players: ["p14", "p15", "p16"] },   // out first  -> worst places
                { players: ["p10", "p11", "p12"] },
                { players: ["p6", "p7", "p8"] },
                { players: ["p2", "p3", "p4"] }        // out last   -> best of the rest
            ]
        });

        const byPlace = Object.fromEntries(rows.map((r) => [r.playerId, r.place]));
        expect(byPlace).toMatchObject({
            p1: 1, p5: 2, p9: 3, p13: 4,
            p2: 5, p3: 6, p4: 7,
            p6: 8, p7: 9, p8: 10,
            p10: 11, p11: 12, p12: 13,
            p14: 14, p15: 15, p16: 16
        });
        expect(rows.map((r) => r.place)).toEqual([...Array(16)].map((_, i) => i + 1));
    });
});

describe("ties", () => {
    it("names everyone on the top score", () => {
        expect(needsTiebreak([
            { playerId: "a", score: 90 },
            { playerId: "b", score: 90 },
            { playerId: "c", score: 80 }
        ])).toEqual(["a", "b"]);
    });

    it("returns a single player when there is no tie", () => {
        expect(needsTiebreak([{ playerId: "a", score: 9 }, { playerId: "b", score: 8 }]))
            .toEqual(["a"]);
    });

    it("orders tied players by the tie-break turn", () => {
        expect(orderByTiebreak(["a", "b", "c"], { a: 10, b: 30, c: 20 })).toEqual(["b", "c", "a"]);
    });

    it("keeps input order when the tie-break also ties", () => {
        expect(orderByTiebreak(["c", "a"], { a: 5, c: 5 })).toEqual(["c", "a"]);
    });
});
