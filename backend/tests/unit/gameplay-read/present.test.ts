import { describe, expect, it } from "vitest";
import type { matches, tournaments } from "../../../src/db/schema/index.js";
import type { ResultEntry } from "../../../src/game/contracts/index.js";
import {
    matchRound,
    presentMatch,
    presentStanding,
    presentTournament,
    presentTournamentSummary,
    stageRange
} from "../../../src/modules/gameplay-read/present.js";

type TournamentRow = typeof tournaments.$inferSelect;
type MatchRow = typeof matches.$inferSelect;

// The public read surface's one rule: a spectator sees the show, never the bank.
// The rows below are deliberately FAT — every column the schema has, including the
// frozen questions with their answers inside.

const STAGE_TITLES = new Map([
    ["qualifiers", "Vòng loại"],
    ["playoffs", "Vòng Playoffs"]
]);

const NAMES = {
    "11111111-1111-1111-1111-111111111111": "A. Voss",
    "22222222-2222-2222-2222-222222222222": "D. Chen"
};

const question = {
    _id: "99999999-9999-9999-9999-999999999999",
    roundId: "khoi-dong",
    turnId: "phase-1",
    position: 0,
    mode: "text",
    kind: "TEXT",
    questionText: "What is 2 + 2?",
    media: null,
    timeLimit: 60_000,
    points: 10,
    
    payload: { acceptedAnswers: ["4", "four"], caseSensitive: false },
    sourceId: "88888888-8888-8888-8888-888888888888"
};

const matchRow = (overrides: Partial<MatchRow> = {}): MatchRow => ({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    tournamentId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    stageId: "playoffs",
    scheduledAt: new Date("2025-06-14T09:30:00Z"),
    label: "Quarterfinal 1",
    status: "FINISHED",
    kind: "STANDARD",
    slot: 1,
    players: [
        { kind: "user", userId: "11111111-1111-1111-1111-111111111111", seed: 1 },
        { kind: "user", userId: "22222222-2222-2222-2222-222222222222", seed: 8 }
    ],
    roundConfigs: { "khoi-dong": { phases: 2, questionsPerPhase: 8 } },
    questions: [question],
    live: { roundId: "khoi-dong", phase: "phase-1", index: 3, questionId: question._id, openedAt: new Date(), deadlineAt: new Date() },
    discord: { lobbyChannelId: "1234567890" },
    createdAt: new Date("2025-06-01T00:00:00Z"),
    updatedAt: new Date("2025-06-13T00:00:00Z"),
    deletedAt: null,
    ...overrides
} as MatchRow);

const results: ResultEntry[] = [
    { kind: "user", userId: "11111111-1111-1111-1111-111111111111", totalScore: 24, rank: 1, roundScores: { "khoi-dong": 10, "ve-dich": 14 } },
    { kind: "user", userId: "22222222-2222-2222-2222-222222222222", totalScore: 21, rank: 2, roundScores: { "khoi-dong": 8, "ve-dich": 13 } }
];

const COVERAGE = { places: 4, covered: 4, missing: [], beyond: [] };

const tournamentRow = (overrides: Partial<TournamentRow> = {}): TournamentRow => ({
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    name: "Olympia Custom 3",
    slug: "olympia-custom-3",
    visibility: "PUBLIC",
    ownerId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    
    current: true,
    rounds: [{ id: "khoi-dong", name: "Khởi động", order: 1, chart: "…" }],
    format: { competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
    placementTiers: [{ min: 1, max: 1, points: 25 }],
    stages: [
        { id: "qualifiers", title: "Vòng loại", start: "2025-06-01T00:00:00Z", end: "2025-06-10T00:00:00Z" },
        { id: "playoffs", title: "Vòng Playoffs", start: "2025-06-11T00:00:00Z", end: "2025-06-20T00:00:00Z" }
    ],
    roundRules: { "khoi-dong": { phases: 2 } },
    closedAt: null,
    createdAt: new Date("2025-05-01T00:00:00Z"),
    updatedAt: new Date("2025-06-01T00:00:00Z"),
    deletedAt: null,
    ...overrides
} as TournamentRow);


// ─── presentMatch ────────────────────────────────────────────────────────────

describe("presentMatch", () => {
    it("never exposes the frozen questions, the live state, the configs or discord", () => {
        const out = presentMatch(matchRow(), STAGE_TITLES, NAMES, results);

        expect(out).not.toHaveProperty("questions");
        expect(out).not.toHaveProperty("live");
        expect(out).not.toHaveProperty("roundConfigs");
        expect(out).not.toHaveProperty("discord");
        expect(out).not.toHaveProperty("tournamentId");
        expect(out).not.toHaveProperty("createdAt");
        expect(out).not.toHaveProperty("updatedAt");
        expect(out).not.toHaveProperty("deletedAt");
        // Belt and braces: nothing that smells like an answer made it through.
        expect(JSON.stringify(out)).not.toContain("acceptedAnswers");
        expect(JSON.stringify(out)).not.toContain("2 + 2");
    });

    it("composes round as the stage title behind the label", () => {
        const out = presentMatch(matchRow(), STAGE_TITLES, NAMES);
        expect(out.round).toBe("Vòng Playoffs · Quarterfinal 1");
    });

    it("falls back to the raw stageId when the stage is unknown", () => {
        const out = presentMatch(matchRow({ stageId: "mystery" }), STAGE_TITLES, NAMES);
        expect(out.round).toBe("mystery · Quarterfinal 1");
    });

    it("resolves seats to { id, name, seed }", () => {
        const out = presentMatch(matchRow(), STAGE_TITLES, NAMES);
        expect(out.players).toEqual([
            { id: "11111111-1111-1111-1111-111111111111", name: "A. Voss", seed: 1 },
            { id: "22222222-2222-2222-2222-222222222222", name: "D. Chen", seed: 8 }
        ]);
    });

    it("falls back to a placeholder for a name it does not know", () => {
        const out = presentMatch(matchRow(), STAGE_TITLES, {});
        expect(out.players[0]?.name).toBe("Unknown");
    });

    it("carries no results when none are passed", () => {
        const out = presentMatch(matchRow(), STAGE_TITLES, NAMES);
        expect(out).not.toHaveProperty("results");
    });

    it("embeds results with resolved names when they are passed", () => {
        const out = presentMatch(matchRow(), STAGE_TITLES, NAMES, results);
        expect(out.results).toEqual([
            {
                id: "11111111-1111-1111-1111-111111111111",
                name: "A. Voss",
                totalScore: 24,
                rank: 1,
                roundScores: { "khoi-dong": 10, "ve-dich": 14 }
            },
            {
                id: "22222222-2222-2222-2222-222222222222",
                name: "D. Chen",
                totalScore: 21,
                rank: 2,
                roundScores: { "khoi-dong": 8, "ve-dich": 13 }
            }
        ]);
    });

    it("resolves a team seat by its teamId", () => {
        const out = presentMatch(
            matchRow({
                players: [{ kind: "team", teamId: "dddddddd-dddd-dddd-dddd-dddddddddddd", seed: 2 }]
            }),
            STAGE_TITLES,
            { "dddddddd-dddd-dddd-dddd-dddddddddddd": "Team Lambda" }
        );
        expect(out.players).toEqual([
            { id: "dddddddd-dddd-dddd-dddd-dddddddddddd", name: "Team Lambda", seed: 2 }
        ]);
    });
});


// ─── matchRound ──────────────────────────────────────────────────────────────

describe("matchRound", () => {
    it("is deterministic for the same inputs", () => {
        const row = matchRow();
        expect(matchRound(row, STAGE_TITLES)).toBe(matchRound(row, STAGE_TITLES));
    });
});


// ─── presentTournament ───────────────────────────────────────────────────────

describe("presentTournament", () => {
    it("never exposes the owner, the tags, the rulebook or the bookkeeping columns", () => {
        const out = presentTournament(tournamentRow(), 4, COVERAGE);

        expect(out).not.toHaveProperty("ownerId");
        expect(out).not.toHaveProperty("tags");
        expect(out).not.toHaveProperty("roundRules");
        expect(out).not.toHaveProperty("updatedAt");
        expect(out).not.toHaveProperty("deletedAt");
        expect(out).not.toHaveProperty("visibility");
    });

    it("derives the window from the stage list", () => {
        const out = presentTournament(tournamentRow(), 4, COVERAGE);
        expect(out.start).toBe("2025-06-01T00:00:00Z");
        expect(out.end).toBe("2025-06-20T00:00:00Z");
    });

    it("carries the places and the points coverage it is given", () => {
        const out = presentTournament(tournamentRow(), 4, COVERAGE);
        expect(out.places).toBe(4);
        expect(out.points).toEqual(COVERAGE);
    });

    it("keeps the points scale — it is the public rules of the show", () => {
        const out = presentTournament(tournamentRow(), 4, COVERAGE);
        expect(out.placementTiers).toEqual([{ min: 1, max: 1, points: 25 }]);
    });

    it("serializes the dates to ISO strings", () => {
        const out = presentTournament(tournamentRow({ closedAt: new Date("2025-06-20T00:00:00Z") }), 4, COVERAGE);
        expect(out.createdAt).toBe("2025-05-01T00:00:00.000Z");
        expect(out.closedAt).toBe("2025-06-20T00:00:00.000Z");
    });
});


// ─── presentTournamentSummary ────────────────────────────────────────────────

describe("presentTournamentSummary", () => {
    it("is the identity and the window, and nothing else", () => {
        const out = presentTournamentSummary(tournamentRow());
        expect(Object.keys(out).sort()).toEqual(
            ["createdAt", "current", "end", "id", "name", "slug", "start"]
        );
    });
});


// ─── stageRange ──────────────────────────────────────────────────────────────

describe("stageRange", () => {
    it("has no window when no stage is dated", () => {
        expect(stageRange([{ id: "s", title: "S" }])).toEqual({ start: null, end: null });
    });

    it("takes the earliest start and the latest end, ignoring undated stages", () => {
        const range = stageRange([
            { id: "a", title: "A", end: "2025-06-05T00:00:00Z" },
            { id: "b", title: "B", start: "2025-06-01T00:00:00Z", end: "2025-06-20T00:00:00Z" },
            { id: "c", title: "C" }
        ]);
        expect(range).toEqual({ start: "2025-06-01T00:00:00Z", end: "2025-06-20T00:00:00Z" });
    });
});


// ─── presentStanding ─────────────────────────────────────────────────────────

describe("presentStanding", () => {
    it("is the engine's row, shaped", () => {
        const out = presentStanding({
            userId: "11111111-1111-1111-1111-111111111111",
            displayName: "A. Voss",
            place: 1,
            matchesPlayed: 3,
            placementPoints: 25,
            stageId: "playoffs",
            stageTitle: "Vòng Playoffs",
            slot: 1
        });
        expect(out).toEqual({
            userId: "11111111-1111-1111-1111-111111111111",
            displayName: "A. Voss",
            place: 1,
            matchesPlayed: 3,
            placementPoints: 25,
            stageId: "playoffs",
            stageTitle: "Vòng Playoffs",
            slot: 1
        });
    });
});
