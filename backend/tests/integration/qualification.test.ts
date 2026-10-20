import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import {
    questionBank, seasonPhaseAnswers, seasonPhaseResults, seasonPlayers, seasons, tournaments, users
} from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// Qualification: enrollment → frozen 16-question setup → mass answering → ranking with a
// tie at the cut.

const PROGRESSION = { advance: 16, questionCount: 16, groupSize: 4, splittingRounds: 2, finaleSize: 4 };

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let outsiderCookie: string;
let tournamentId: string;
let seasonId: string;
let playerIds: string[];
let questionIds: string[];      // the bank ids, for setup
let frozenIds: string[];        // the season's frozen copies

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "q-owner", displayName: "Q Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const rows = await db.insert(users).values(
        Array.from({ length: 18 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `q${i}@example.com`,
            displayName: `Q${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = rows.map((r) => r.id);
    playerCookies = rows.map((r) =>
        signToken(app, "GAMEPLAY", { sub: r.id, role: "PLAYER", tokenVersion: 0 }));

    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: "q-outsider@example.com", displayName: "Out", tokenVersion: 0
    }).returning();
    outsiderCookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });

    const [tournament] = await db.insert(tournaments).values({
        name: "Q Tournament", slug: "q-tournament", visibility: "PUBLIC", ownerId: owner.id,
        defaultTags: ["THTH"],
        defaultRounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        defaultFormat: { competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        defaultPlacementTiers: [{ min: 1, max: 4, points: 10 }],
        defaultProgression: PROGRESSION
    }).returning();
    tournamentId = tournament.id;

    const [season] = await db.insert(seasons).values({
        tournamentId, name: "Q Season",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: { competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 4, points: 10 }],
        stages: [],
        progression: PROGRESSION
    }).returning();
    seasonId = season.id;

    const questions = await db.insert(questionBank).values(
        Array.from({ length: 16 }, (_, i) => ({
            kind: "MC" as const,
            questionText: `Q${i}`,
            tag: "THTH",
            payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctSet: ["a"] },
            timeLimit: 30,
            status: "PUBLISHED" as const,
            tournamentId: null,
            createdBy: owner.id
        }))
    ).returning();
    questionIds = questions.map((q) => q.id);
});

afterAll(async () => {
    await app.close();
});

const enrollUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/players`;
const setupUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/qualification/setup`;
const closeUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/qualification/close`;
const staffViewUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/qualification`;
const playerViewUrl = () => `/gameplay/seasons/${seasonId}/qualification`;
const answerUrl = () => `/gameplay/seasons/${seasonId}/qualification/answers`;

const answer = (cookie: string, questionId: string, picked: string) =>
    app.inject({
        method: "POST", url: answerUrl(), headers: asPlayer(cookie),
        payload: { questionId, value: { picked: [picked] } }
    });

describe("qualification — enrollment and setup", () => {
    it("enrolls the field", async () => {
        const res = await app.inject({
            method: "POST", url: enrollUrl(), headers: auth(ownerCookie),
            payload: { userIds: playerIds }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().enrolled).toBe(18);
    });

    it("freezes exactly the configured number of questions", async () => {
        const res = await app.inject({
            method: "POST", url: setupUrl(), headers: auth(ownerCookie),
            payload: { questionIds }
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().questions).toBe(16);

        const [season] = await db.select().from(seasons).where(eq(seasons.id, seasonId));
        frozenIds = (season.qualificationQuestions ?? []).map((q) => q._id);
        expect(frozenIds).toHaveLength(16);
    });

    it("refuses a second setup", async () => {
        const res = await app.inject({
            method: "POST", url: setupUrl(), headers: auth(ownerCookie),
            payload: { questionIds }
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("ALREADY_SETUP");
    });

    it("shows a player the questions without the answers", async () => {
        const res = await app.inject({ method: "GET", url: playerViewUrl(), headers: asPlayer(playerCookies[0]) });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.closed).toBe(false);
        expect(body.questions).toHaveLength(16);

        const payload = body.questions[0].payload as Record<string, unknown>;
        expect(payload.options).toHaveLength(2);
        expect(payload).not.toHaveProperty("correctSet");
    });

    it("refuses a player who is not enrolled", async () => {
        const res = await answer(outsiderCookie, frozenIds[0], "a");
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("NOT_ENROLLED");
    });
});

describe("qualification — answering", () => {
    it("auto-matches a correct answer and awards one point", async () => {
        const res = await answer(playerCookies[0], frozenIds[0], "a");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ verdict: "CORRECT", points: 1 });
    });

    it("a wrong answer is recorded with no points, and can be revised", async () => {
        const wrong = await answer(playerCookies[1], frozenIds[0], "b");
        expect(wrong.json()).toEqual({ verdict: "INCORRECT", points: 0 });

        const revised = await answer(playerCookies[1], frozenIds[0], "a");
        expect(revised.json()).toEqual({ verdict: "CORRECT", points: 1 });

        const rows = await db.select().from(seasonPhaseAnswers).where(and(
            eq(seasonPhaseAnswers.seasonId, seasonId),
            eq(seasonPhaseAnswers.userId, playerIds[1]),
            eq(seasonPhaseAnswers.questionId, frozenIds[0])
        ));
        expect(rows).toHaveLength(1);                  // revised in place
    });

    it("seeds the remaining field with deterministic scores", async () => {
        // scores 16,15,…,2 for players 0..14 ; 1,1 for 15 and 16 (a tie across the cut) ; 0 for 17
        const targets = [16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1, 0];
        const rows: Array<typeof seasonPhaseAnswers.$inferInsert> = [];

        for (let i = 0; i < targets.length; i++) {
            const already = i === 0 || i === 1 ? 1 : 0;    // players 0 and 1 answered over HTTP
            for (let q = already; q < targets[i]; q++) {
                rows.push({
                    seasonId,
                    phaseId: "qualification",
                    questionId: frozenIds[q],
                    userId: playerIds[i],
                    value: { picked: ["a"] },
                    verdict: "CORRECT",
                    autoMatched: true,
                    pointsAwarded: 1
                });
            }
        }
        await db.insert(seasonPhaseAnswers).values(rows).onConflictDoNothing();
    });
});

describe("qualification — closing", () => {
    it("refuses to close while a tie straddles the cut and nothing separates it", async () => {
        const res = await app.inject({
            method: "POST", url: closeUrl(), headers: auth(ownerCookie), payload: {}
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("TIES_UNRESOLVED");
        expect(res.json().details).toHaveLength(1);
    });

    it("closes once the second point system separates the tie, advancing sixteen", async () => {
        // Phase 1 ties are broken by another point system, not a tie-break turn.
        // player 16 scored higher on it than player 15
        const res = await app.inject({
            method: "POST", url: closeUrl(), headers: auth(ownerCookie),
            payload: { secondaryScores: { [playerIds[15]]: 2, [playerIds[16]]: 7 } }
        });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.advancing).toHaveLength(16);
        expect(body.advancing).toContain(playerIds[16]);
        expect(body.advancing).not.toContain(playerIds[15]);
        expect(body.advancing).not.toContain(playerIds[17]);    // score 0
        expect(body.rows).toHaveLength(18);
    });

    it("writes the ranking once", async () => {
        const rows = await db.select().from(seasonPhaseResults).where(and(
            eq(seasonPhaseResults.seasonId, seasonId),
            eq(seasonPhaseResults.phaseId, "qualification")
        ));
        expect(rows).toHaveLength(18);
        expect(rows.find((r) => r.userId === playerIds[0])).toMatchObject({ score: 16, rank: 1 });
    });

    it("refuses a second close and further answers", async () => {
        const close = await app.inject({
            method: "POST", url: closeUrl(), headers: auth(ownerCookie), payload: {}
        });
        expect(close.statusCode).toBe(409);
        expect(close.json().error).toBe("CLOSED");

        const late = await answer(playerCookies[17], frozenIds[0], "a");
        expect(late.statusCode).toBe(409);
        expect(late.json().error).toBe("CLOSED");
    });

    it("the staff view reports the closed ranking", async () => {
        const res = await app.inject({ method: "GET", url: staffViewUrl(), headers: auth(ownerCookie) });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ closed: true, questionCount: 16, advance: 16, enrolled: 18 });
        expect(res.json().results[0]).toMatchObject({ rank: 1, score: 16 });
    });
});
