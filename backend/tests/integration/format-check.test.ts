import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matchResults, matches, questionBank, seasonPlayers, seasons, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// The format, checked against the matches the staff place: the engine never draws, but
// it refuses a match that breaks the bracket.

let app: FastifyInstance;
let ownerCookie: string;
let seasonId: string;
let playerIds: string[];      // in rank order: playerIds[0] is the best

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const seasonUrl = (suffix: string) =>
    `/portal/seasons/${seasonId}${suffix}`;

const seat = (index: number) => ({
    kind: "user" as const,
    userId: playerIds[index],
    seed: index + 1
});

const createMatch = (payload: Record<string, unknown>) =>
    app.inject({
        method: "POST",
        url: seasonUrl("/matches"),
        headers: auth(ownerCookie),
        payload: {
            stageId: "splitting-1",
            label: "Match",
            scheduledAt: "2026-03-01T10:00:00Z",
            roundConfigs: {
                "ve-dich": {
                    allowedKinds: ["MC"],
                    scoring: { template: "constant", points: 10 },
                    turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 2 }]
                }
            },
            ...payload
        }
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "fc-owner", displayName: "FC Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 16 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `fc${i}@example.com`,
            displayName: `FC${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);

    // The season is the unit: it carries the identity the tournament had.
    const seasonTags = ["THTH"];
    const seasonOwner = owner.id;
    const seasonSlug = "fc-tournament-season";

    const [season] = await db.insert(seasons).values({
        ownerId: seasonOwner, visibility: "PUBLIC", tags: seasonTags, slug: seasonSlug,
        name: "FC Season",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: {
            competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null,
            teamAggregation: null, teamCountAggregation: null
        },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        // the first splitting round: the tier draw
        stages: [{ id: "splitting-1", title: "Splitting 1", role: "splitting" }],
        roundRules: {
            "ve-dich": {
                allowedKinds: ["MC"],
                scoring: { template: "constant", points: 10 },
                turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 2 }]
            }
        }
    }).returning();
    seasonId = season.id;

    await db.insert(seasonPlayers).values(playerIds.map((userId) => ({ seasonId, userId })));

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

    // The mass event, closed: its result is the field's ranking.
    const [massEvent] = await db.insert(matches).values({
        seasonId,
        kind: "QUALIFICATION",
        stageId: "qualification",
        label: "Qualification",
        scheduledAt: new Date(),
        status: "FINISHED",
        players: playerIds.map((userId, index) => ({ kind: "user" as const, userId, seed: index + 1 })),
        roundConfigs: {},
        questions: []
    }).returning();

    await db.insert(matchResults).values({
        matchId: massEvent.id,
        seasonId,
        results: playerIds.map((userId, index) => ({
            kind: "user" as const,
            userId,
            totalScore: 100 - index,
            rank: index + 1,
            roundScores: {}
        }))
    });
});

afterAll(async () => {
    await app.close();
});


describe("the tier draw", () => {
    it("accepts a match with one player from each tier", async () => {
        // Ranks 1, 5, 9 and 13: one from each tier of four.
        const res = await createMatch({ players: [seat(0), seat(4), seat(8), seat(12)] });
        expect(res.statusCode).toBe(201);
    });

    it("refuses a match with two players from the same tier", async () => {
        const res = await createMatch({ players: [seat(0), seat(1), seat(8), seat(12)] });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
        expect(JSON.stringify(res.json().details)).toContain("tier 0");
    });

    it("refuses a match that misses a tier", async () => {
        const res = await createMatch({ players: [seat(0), seat(4), seat(8), seat(9)] });
        expect(res.statusCode).toBe(400);
        expect(JSON.stringify(res.json().details)).toContain("tier 2");
    });

    it("leaves a stage without a role alone", async () => {
        const res = await createMatch({
            stageId: "somewhere-else",
            players: [seat(0), seat(1), seat(2), seat(3)]
        });
        // the stage is not in the season's list at all, so nothing is checked
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("not one of this season's stages");
    });
});
