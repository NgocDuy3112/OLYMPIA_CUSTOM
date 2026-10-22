import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { questionBank, seasonPlayers, seasonStandings, seasons, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { RoundConfig } from "../../src/game/contracts/index.js";

// The season's places are decided by how far a player got: the last stage they reached,
// the match they were eliminated in, and their rank in it. The points never decide the
// order — they are a statistic.

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

const STAGES = [
    { id: "round-1", title: "Round 1" },
    { id: "round-2", title: "Round 2" }
];

const createMatch = (payload: Record<string, unknown>) =>
    app.inject({
        method: "POST",
        url: seasonUrl("/matches"),
        headers: auth(ownerCookie),
        payload: {
            stageId: "round-1",
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
        Array.from({ length: 6 }, (_, i) => ({
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
        stages: STAGES,
        roundRules
    }).returning();
    seasonId = season.id;

    // The roster: the season's field. Everyone enrolled is in the table, even the ones
    // who never played.
    await db.insert(seasonPlayers).values(
        playerIds.map((userId) => ({ seasonId, userId }))
    );

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


describe("a match placed by hand", () => {
    it("takes the season's rules and assembles the questions", async () => {
        const created = await createMatch({
            players: playerIds.slice(0, 4).map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(created.statusCode).toBe(201);

        const body = created.json();
        expect(body.kind).toBe("STANDARD");
        expect(body.roundConfigs).toHaveProperty("ve-dich");
        // The rulebook asks for four questions in the only turn of the only round.
        expect(body.questions).toHaveLength(4);
    });

    it("refuses a group that is the wrong size for the format", async () => {
        const created = await createMatch({
            players: playerIds.slice(0, 3).map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(created.statusCode).toBe(400);
        expect(created.json().error).toBe("VALIDATION");
    });

    it("refuses a stage the season does not list", async () => {
        const created = await createMatch({
            stageId: "mystery",
            players: playerIds.slice(0, 4).map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(created.statusCode).toBe(400);
        expect(created.json().error).toBe("VALIDATION");
    });
});


describe("the season's places", () => {
    let firstMatch: string;
    let secondMatch: string;

    it("places the players of the last stage first", async () => {
        // Round 1: everybody plays. The four winners go on to round 2.
        const first = await createMatch({
            stageId: "round-1",
            slot: 1,
            players: playerIds.slice(0, 4).map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(first.statusCode).toBe(201);
        firstMatch = first.json().id;

        await setResults(firstMatch, [
            { userId: playerIds[0], score: 40 },
            { userId: playerIds[1], score: 30 },
            { userId: playerIds[2], score: 20 },
            { userId: playerIds[3], score: 10 }
        ]);

        const second = await createMatch({
            stageId: "round-2",
            slot: 1,
            players: playerIds.slice(0, 4).map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        expect(second.statusCode).toBe(201);
        secondMatch = second.json().id;

        // In round 2 the player who was last in round 1 wins the match. The season's
        // points do not order the field: three of them finish on 50 points, and only
        // the progress says who is first.
        await setResults(secondMatch, [
            { userId: playerIds[2], score: 30 },
            { userId: playerIds[1], score: 20 },
            { userId: playerIds[0], score: 10 },
            { userId: playerIds[3], score: 0 }
        ]);

        const rows = (await standings()).json().rows as Array<{
            userId: string; displayName: string; place: number | null;
            totalPoints: number; matchesPlayed: number; placementPoints: number;
            stageTitle: string | null; tieBreak: string | null;
        }>;

        expect(rows).toHaveLength(6);

        // The four who reached round 2 take the first four places, in that match's order.
        expect(rows.slice(0, 4).map((row) => row.userId)).toEqual([
            playerIds[2], playerIds[1], playerIds[0], playerIds[3]
        ]);
        expect(rows.slice(0, 4).map((row) => row.place)).toEqual([1, 2, 3, 4]);
        expect(rows.slice(0, 4).every((row) => row.stageTitle === "Round 2")).toBe(true);

        // Three of them finished on 50 points in the season; only the progress orders
        // them. The bonus follows the place.
        expect(rows.map((row) => row.placementPoints)).toEqual([10, 10, 0, 0, 0, 0]);
    });

    it("places the players who stopped in round 1 below them", async () => {
        const rows = (await standings()).json().rows as Array<{
            userId: string; place: number | null; stageTitle: string | null; tieBreak: string | null;
        }>;

        // Players 4 and 5 never played: no place, at the bottom.
        expect(rows[4].userId).toBe(playerIds[4]);
        expect(rows[4].place).toBeNull();
        expect(rows[4].tieBreak).toBe("never played");
        expect(rows[5].userId).toBe(playerIds[5]);
        expect(rows[5].place).toBeNull();
    });

    it("stores the places as the season's record", async () => {
        const stored = await db.select().from(seasonStandings)
            .where(eq(seasonStandings.seasonId, seasonId));
        expect(stored).toHaveLength(4);
        expect(stored.map((row) => row.rank).sort()).toEqual([1, 2, 3, 4]);
    });
});
