import { describe, expect, it } from "vitest";
import { rngFromSeed, newDrawSeed } from "../../../src/modules/progression/rng.js";
import { drawGroupsFor, replayDraw, stageIdFor } from "../../../src/modules/progression/splitting.js";

const RANKED = Array.from({ length: 16 }, (_, i) => `p${i + 1}`);
const SEED = "0123456789abcdef0123456789abcdef";

describe("rngFromSeed", () => {
    it("is deterministic", () => {
        const a = rngFromSeed(SEED);
        const b = rngFromSeed(SEED);
        expect(Array.from({ length: 8 }, a)).toEqual(Array.from({ length: 8 }, b));
    });

    it("stays in [0, 1)", () => {
        const rng = rngFromSeed(SEED);
        for (let i = 0; i < 1000; i++) {
            const value = rng();
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it("rejects a seed that is not hex", () => {
        expect(() => rngFromSeed("zzzzzzzz")).toThrow(/8 hex characters/);
    });
});

describe("the draw", () => {
    it("reproduces the same groups from the same seed", () => {
        const first = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: SEED });
        const again = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: SEED });
        expect(again.groups).toEqual(first.groups);
    });

    it("changes the groups when the seed changes", () => {
        const a = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: SEED });
        const b = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: newDrawSeed() });
        expect(b.groups).not.toEqual(a.groups);
    });

    it("puts exactly one player from each rank tier in each match", () => {
        const { groups } = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: SEED });
        expect(groups).toHaveLength(4);
        for (const group of groups) {
            const ranks = group.map((id) => RANKED.indexOf(id));
            const tiers = new Set(ranks.map((rank) => Math.floor(rank / 4)));
            expect(tiers.size).toBe(4);                 // one S, one A, one B, one C
        }
    });

    it("uses every player exactly once", () => {
        const { groups } = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: SEED });
        expect(groups.flat().sort()).toEqual([...RANKED].sort());
    });

    it("replays a stored draw into the same groups", () => {
        const draw = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 2, seed: SEED });
        expect(replayDraw({ ranked: RANKED, groupSize: 4, seed: draw.seed })).toEqual(draw.groups);
        expect(draw.stageId).toBe("splitting-2");
        expect(stageIdFor(1)).toBe("splitting-1");
    });

    it("orders each group by tier, so the UI can label rows", () => {
        const { groups } = drawGroupsFor({ ranked: RANKED, groupSize: 4, round: 1, seed: SEED });
        for (const group of groups) {
            const tiers = group.map((id) => Math.floor(RANKED.indexOf(id) / 4));
            expect(tiers).toEqual([0, 1, 2, 3]);   // not just "one of each" — in order
        }
    });
});