import { describe, expect, it } from "vitest";
import { nextRoundId, orderedMatchRounds } from "../../../src/modules/matches/rounds.js";
import type { RoundConfig, SeasonRound } from "../../../src/game/contracts/index.js";

const SEASON: SeasonRound[] = [
    { id: "ve-dich", name: "Ve Dich", order: 3, chart: "bars" },
    { id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" },
    { id: "but-pha", name: "But Pha", order: 2, chart: "bars" },
    { id: "giai-ma", name: "Giai Ma", order: 1, chart: "bars" }
];

const cfg = (): RoundConfig => ({
    allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: []
});
const CONFIGS: Record<string, RoundConfig> = { "giai-ma": cfg(), "but-pha": cfg() };

describe("orderedMatchRounds", () => {
    it("orders by the season's order and keeps only rounds the match configures", () => {
        expect(orderedMatchRounds(SEASON, CONFIGS)).toEqual(["giai-ma", "but-pha"]);
    });

    it("is empty when the match configures nothing", () => {
        expect(orderedMatchRounds(SEASON, {})).toEqual([]);
    });
});

describe("nextRoundId", () => {
    it("returns the first round when there is no current round", () => {
        expect(nextRoundId(["giai-ma", "but-pha"], null)).toBe("giai-ma");
    });

    it("returns the following round", () => {
        expect(nextRoundId(["giai-ma", "but-pha"], "giai-ma")).toBe("but-pha");
    });

    it("returns null at the end of the season", () => {
        expect(nextRoundId(["giai-ma", "but-pha"], "but-pha")).toBeNull();
    });

    it("returns null for a round not in the list", () => {
        expect(nextRoundId(["giai-ma"], "ve-dich")).toBeNull();
    });

    it("returns null when there are no rounds", () => {
        expect(nextRoundId([], null)).toBeNull();
    });
});
