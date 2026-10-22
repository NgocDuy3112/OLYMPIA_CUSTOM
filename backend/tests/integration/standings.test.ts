import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { questionBank, seasonStandings, seasons, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { RoundConfig } from "../../src/game/contracts/index.js";

// The standings are never typed in: they follow the points of the matches that were
// played, and they are recomputed when a match ends.

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;
let seasonId: string;
let playerIds: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const seasonUrl = (suffix: string) =>
    `/portal/tournaments/${tournamentId}/seasons/${seasonId}${suffix}`;

const roundRules: Record<string, RoundConfig> = {
    "ve-dich": {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 4 }]
    }
};

const createMatch = (payload: Record<string, unknown>) =>
    app.inject({
        method: "POST",
        url: seasonUrl("/matches"),
        headers: auth(ownerCookie),
        payload: {
            stageId: "stage-1",
            label: "Match",
            scheduledAt: "2026-03-01T10:00:00Z",
            ...payload
        }
    });

const setResults = (matchId: string, totals: Array<{ userId: string; score: number }>) =>
    app.inject({
        method: "POST",
        url: seasonUrl(`/matches/${matchId}/results`),
        headers: auth(ownerCookie),
        payload: { totals }
    });

const standings = () =>
    app.inject({ method: "GET", url: seasonUrl("/standings"), headers: auth(ownerCookie) });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "st-owner", displayName: "ST Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 4 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `st${i}@example.com`,
            displayName: `ST${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);

    const [tournament] = await db.insert(tournaments).values({
        name: "ST Tournament", slug: "st-tournament", visibility: "PUBLIC", ownerId: owner.id,
        defaultTags: ["THTH"],
        defaultRounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        defaultFormat: {
            competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null,
            teamAggregation: null, teamCountAggregation: null
        },
        defaultPlacementTiers: [{ min: 1, max: 2, points: 10 }]
    }).returning();
    tournamentId = tournament.id;

    const [season] = await db.insert(seasons).values({
        tournamentId,
        name: "ST Season",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: {
            competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null,
            teamAggregation: null, teamCountAggregation: null
        },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: [],
        roundRules
    }).returning();
    seasonId = season.id;

    await db.insert(questionBank).values(
        Array.from({ length: 8 }, (_, i) => ({
            kind: "MC" as const,
            questionText: `Q${i}`,
            tag: "THTH",
            payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctSet: ["a"] },
            timeLimit: 30,
            status: "PUBLISHED" as const,
            tournamentId: null,
            createdBy: owner.id
        }))
    );
});

afterAll(async () => {
    await app.close();
});


describe("the standings", () => {
    it("start empty", async () => {
        const res = await standings();
        expect(res.statusCode).toBe(200);
        expect(res.json().rows).toHaveLength(0);
    });

    it("follow the points of the matches that were played", async () => {
        const created = await createMatch({
            players: playerIds.map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(created.statusCode).toBe(201);
        const matchId = created.json().id;

        const done = await setResults(matchId, [
            { userId: playerIds[0], score: 40 },
            { userId: playerIds[1], score: 30 },
            { userId: playerIds[2], score: 20 },
            { userId: playerIds[3], score: 10 }
        ]);
        expect(done.statusCode).toBe(200);

        const res = await standings();
        const rows = res.json().rows as Array<{
            userId: string; displayName: string; totalScore: number;
            rank: number; placementPoints: number; matchesPlayed: number;
        }>;

        expect(rows).toHaveLength(4);
        expect(rows.map((row) => row.userId)).toEqual(playerIds);
        expect(rows.map((row) => row.totalScore)).toEqual([40, 30, 20, 10]);
        expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4]);
        expect(rows.map((row) => row.matchesPlayed)).toEqual([1, 1, 1, 1]);

        // The bonus points come from the season's placement tiers: places 1 and 2.
        expect(rows.map((row) => row.placementPoints)).toEqual([10, 10, 0, 0]);
        expect(rows[0].displayName).toBe("ST0");

        const persisted = await db.select().from(seasonStandings)
            .where(eq(seasonStandings.seasonId, seasonId));
        expect(persisted).toHaveLength(4);
    });

    it("add up over the season", async () => {
        const created = await createMatch({
            stageId: "stage-2",
            label: "Match 2",
            players: playerIds.map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        const matchId = created.json().id;

        await setResults(matchId, [
            { userId: playerIds[3], score: 50 },
            { userId: playerIds[2], score: 30 },
            { userId: playerIds[1], score: 10 },
            { userId: playerIds[0], score: 10 }
        ]);

        const rows = (await standings()).json().rows as Array<{
            userId: string; totalScore: number; rank: number; matchesPlayed: number;
        }>;

        // Player 3 overtakes everyone: 10 + 50 = 60.
        expect(rows[0].userId).toBe(playerIds[3]);
        expect(rows[0].totalScore).toBe(60);
        expect(rows[0].matchesPlayed).toBe(2);
        expect(rows.map((row) => row.totalScore)).toEqual([50, 40, 50, 60].sort((a, b) => b - a));
    });

    it("can be recomputed by hand", async () => {
        await db.delete(seasonStandings).where(eq(seasonStandings.seasonId, seasonId));

        const res = await app.inject({
            method: "POST", url: seasonUrl("/standings/recompute"), headers: auth(ownerCookie)
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().rows).toHaveLength(4);
    });
});


describe("a match placed by hand", () => {
    it("takes the season's rules and assembles the questions", async () => {
        const created = await createMatch({
            players: playerIds.map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(created.statusCode).toBe(201);

        const body = created.json();
        expect(body.kind).toBe("STANDARD");
        expect(body.roundConfigs).toHaveProperty("ve-dich");
        // The rulebook asks for four questions in the only turn of the only round.
        expect(body.questions).toHaveLength(4);
        expect(body.questions[0].roundId).toBe("ve-dich");
    });

    it("refuses a group that is the wrong size for the format", async () => {
        const created = await createMatch({
            players: playerIds.slice(0, 3).map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(created.statusCode).toBe(400);
        expect(created.json().error).toBe("VALIDATION");
    });
});
