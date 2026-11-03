import { describe, expect, it } from "vitest";
import { nextRoundId, orderedMatchRounds } from "../../../src/modules/matches/rounds.js";
import type { RoundConfig, TournamentRound } from "../../../src/game/contracts/index.js";

// Which rounds a match plays. The RULEBOOK is the default now, so a match created
// with no saved configs still plays the four — filtering on the saved config alone
// left such a match with an EMPTY navigator and no live record to open.
//
// The original rule still holds for a round the app cannot serve: it needs an
// explicit config to be played.

const SEASON: TournamentRound[] = [
    { id: "ve-dich", name: "Ve Dich", order: 3, chart: "bars" },
    { id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" },
    { id: "but-pha", name: "But Pha", order: 2, chart: "bars" },
    { id: "giai-ma", name: "Giai Ma", order: 1, chart: "bars" }
];

const cfg = (): RoundConfig => ({
    allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: []
});

describe("orderedMatchRounds", () => {
    it("orders by the tournament's order", () => {
        expect(orderedMatchRounds(SEASON, {})).toEqual(["khoi-dong", "giai-ma", "but-pha", "ve-dich"]);
    });

    it("plays the AOC rounds even when the match saved no configs", () => {
        // the case that broke: a hand-made match with `roundConfigs: {}` played nothing
        expect(orderedMatchRounds(SEASON, {})).toHaveLength(4);
    });

    it("keeps a round the rulebook cannot serve only when the match configures it", () => {
        const rounds = [...SEASON, { id: "custom", name: "Custom", order: 9, chart: "bars" }];
        expect(orderedMatchRounds(rounds, {})).not.toContain("custom");
        expect(orderedMatchRounds(rounds, { custom: cfg() })).toContain("custom");
    });
});

describe("nextRoundId", () => {
    it("returns the first round when there is no current round", () => {
        expect(nextRoundId(["giai-ma", "but-pha"], null)).toBe("giai-ma");
    });

    it("returns the following round", () => {
        expect(nextRoundId(["giai-ma", "but-pha"], "giai-ma")).toBe("but-pha");
    });

    it("returns null at the end of the tournament", () => {
        expect(nextRoundId(["giai-ma", "but-pha"], "but-pha")).toBeNull();
    });

    it("returns null for a round not in the list", () => {
        expect(nextRoundId(["giai-ma"], "ve-dich")).toBeNull();
    });

    it("returns null when there are no rounds", () => {
        expect(nextRoundId([], null)).toBeNull();
    });
});
