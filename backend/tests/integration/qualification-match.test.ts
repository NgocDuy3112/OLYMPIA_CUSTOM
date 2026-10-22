import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import {
    answers, matchClocks, matchResults, matches, questionBank, seasons, users
} from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// The mass event, modelled as a match: the whole roster is seated, everyone answers the
// same question set once, the time is the server's, and closing the match ranks the field.

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let outsiderCookie: string;
let seasonId: string;
let playerIds: string[];
let ownerId: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const seasonUrl = (suffix: string) =>
    `/portal/seasons/${seasonId}${suffix}`;

const createQualification = (payload: Record<string, unknown> = {}) =>
    app.inject({
        method: "POST",
        url: seasonUrl("/qualification-matches"),
        headers: auth(ownerCookie),
        payload: {
            label: "Qualification",
            scheduledAt: "2026-11-01T19:00:00.000Z",
            questionCount: 8,
            ...payload
        }
    });

const playerView = (matchId: string, cookie: string) =>
    app.inject({ method: "GET", url: `/gameplay/matches/${matchId}/qualification`, headers: asPlayer(cookie) });

const answer = (matchId: string, cookie: string, questionId: string, picked: string) =>
    app.inject({
        method: "POST",
        url: `/gameplay/matches/${matchId}/qualification/answers`,
        headers: asPlayer(cookie),
        payload: { questionId, value: { picked: [picked] } }
    });

const close = (matchId: string, payload: Record<string, unknown> = {}) =>
    app.inject({
        method: "POST",
        url: seasonUrl(`/qualification-matches/${matchId}/close`),
        headers: auth(ownerCookie),
        payload
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "qm-owner", displayName: "QM Owner", tokenVersion: 0
    }).returning();
    ownerId = owner.id;
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 6 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `qm${i}@example.com`,
            displayName: `QM${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);
    playerCookies = players.map((row) =>
        signToken(app, "GAMEPLAY", { sub: row.id, role: "PLAYER", tokenVersion: 0 }));

    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: "qm-outsider@example.com", displayName: "Out", tokenVersion: 0
    }).returning();
    outsiderCookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });

    // The season is the unit: it carries the identity the tournament had.
    const seasonTags = ["THTH"];
    const seasonSlug = "qm-tournament-season";

    const [season] = await db.insert(seasons).values({
        ownerId, visibility: "PUBLIC", tags: seasonTags, slug: seasonSlug,
        name: "QM Season",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: {
            competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null,
            teamAggregation: null, teamCountAggregation: null
        },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: []
    }).returning();
    seasonId = season.id;

    await db.insert(questionBank).values(
        Array.from({ length: 12 }, (_, i) => ({
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

    // The roster: everyone in the season may take a seat.
    const enrolled = await app.inject({
        method: "POST", url: seasonUrl("/players"), headers: auth(ownerCookie),
        payload: { userIds: playerIds }
    });
    expect(enrolled.statusCode).toBe(200);
});

afterAll(async () => {
    await app.close();
});


describe("the mass event — creating it", () => {
    it("seats the whole roster and freezes the questions", async () => {
        const res = await createQualification();
        expect(res.statusCode).toBe(201);

        const body = res.json();
        expect(body.kind).toBe("QUALIFICATION");
        expect(body.stageId).toBe("qualification");
        expect(body.players).toHaveLength(6);
        expect(body.questions).toHaveLength(8);
        expect(body.status).toBe("UPCOMING");

        // The questions are copies: the bank's ids are kept, but the copies are frozen.
        const [row] = await db.select().from(matches).where(eq(matches.id, body.id));
        expect(row.questions).toHaveLength(8);
        expect(new Set(row.questions.map((q) => q._id)).size).toBe(8);
    });

    it("refuses a season with no enrolled players", async () => {
        const [empty] = await db.insert(seasons).values({
            ownerId,
            slug: "qm-empty",
            visibility: "PUBLIC",
            tags: ["THTH"],
            name: "QM Empty",
            rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
            format: {
                competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null,
                teamAggregation: null, teamCountAggregation: null
            },
            placementTiers: [{ min: 1, max: 2, points: 10 }],
            stages: []
        }).returning();

        const res = await app.inject({
            method: "POST",
            url: `/portal/seasons/${empty.id}/qualification-matches`,
            headers: auth(ownerCookie),
            payload: { label: "Q", scheduledAt: "2026-11-01T19:00:00.000Z", questionCount: 4 }
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("NOT_ENROLLED");
    });

    it("refuses more questions than the bank can supply", async () => {
        const res = await createQualification({ questionCount: 100 });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_ENOUGH_QUESTIONS");
    });
});


describe("the mass event — answering", () => {
    let matchId: string;
    let questionIds: string[];

    beforeAll(async () => {
        const res = await createQualification();
        matchId = res.json().id;

        const view = await playerView(matchId, playerCookies[0]);
        questionIds = view.json().questions.map((q: { questionId: string }) => q.questionId);
    });

    it("shows a player the questions without the answers", async () => {
        const res = await playerView(matchId, playerCookies[0]);
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.questions).toHaveLength(8);
        expect(body.closed).toBe(false);

        const payload = body.questions[0].payload as Record<string, unknown>;
        expect(payload.options).toHaveLength(2);
        expect(payload).not.toHaveProperty("correctSet");
    });

    it("refuses a player who is not seated", async () => {
        const res = await playerView(matchId, outsiderCookie);
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("NOT_ENROLLED");
    });

    it("auto-matches a correct answer", async () => {
        const res = await answer(matchId, playerCookies[0], questionIds[0], "a");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ verdict: "CORRECT" });
    });

    it("a chosen option is final — a second answer is refused", async () => {
        const again = await answer(matchId, playerCookies[0], questionIds[0], "b");
        expect(again.statusCode).toBe(409);
        expect(again.json().error).toBe("ALREADY_ANSWERED");

        const rows = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.userId, playerIds[0]),
            eq(answers.questionId, questionIds[0])
        ));
        expect(rows).toHaveLength(1);
        expect(rows[0].verdict).toBe("CORRECT");
    });

    it("times the answer with the server's clock, not the client's", async () => {
        const res = await answer(matchId, playerCookies[1], questionIds[0], "a");
        expect(res.statusCode).toBe(200);

        const rows = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.userId, playerIds[1])
        ));
        expect(rows).toHaveLength(1);
        expect(rows[0].answeredMs).toBeGreaterThanOrEqual(0);
        expect(rows[0].answeredMs).toBeLessThan(10_000);

        const [clock] = await db.select().from(matchClocks).where(and(
            eq(matchClocks.matchId, matchId),
            eq(matchClocks.userId, playerIds[1])
        ));
        expect(clock.openedAt).toBeInstanceOf(Date);
        expect(clock.lastAnswerAt).toBeInstanceOf(Date);
    });

    it("refuses a client-supplied answer time", async () => {
        const res = await app.inject({
            method: "POST",
            url: `/gameplay/matches/${matchId}/qualification/answers`,
            headers: asPlayer(playerCookies[2]),
            payload: { questionId: questionIds[1], value: { picked: ["a"] }, answeredMs: 1 }
        });
        expect(res.statusCode).toBe(400);
    });

    it("refuses a question that is not in this match", async () => {
        const res = await answer(matchId, playerCookies[2], "00000000-0000-4000-8000-000000000000", "a");
        expect(res.statusCode).toBe(404);
    });
});


describe("the mass event — closing it", () => {
    let matchId: string;
    let questionIds: string[];

    beforeAll(async () => {
        const res = await createQualification({ questionCount: 5 });
        matchId = res.json().id;

        const view = await playerView(matchId, playerCookies[0]);
        questionIds = view.json().questions.map((q: { questionId: string }) => q.questionId);

        // Player i answers the first 5 - i questions right and the rest wrong, so every
        // player has a different number of correct answers and the field never ties.
        for (let player = 0; player < 6; player++) {
            for (let q = 0; q < questionIds.length; q++) {
                await answer(
                    matchId,
                    playerCookies[player],
                    questionIds[q],
                    q < 5 - player ? "a" : "b"
                );
            }
        }
    });

    it("ranks the field by the crowd-weighted score", async () => {
        const res = await close(matchId);
        expect(res.statusCode).toBe(200);

        const rows = res.json().rows as Array<{ userId: string; rank: number; score: number }>;
        expect(rows).toHaveLength(6);
        expect(rows.map((row) => row.userId)).toEqual(playerIds);
        expect(rows.map((row) => row.rank)).toEqual([1, 2, 3, 4, 5, 6]);

        // The crowd weights: the question everyone but one got right is worth 1 point to
        // each of them, the last question is worth 5 to the one who got it.
        expect(rows.map((row) => row.score)).toEqual([15, 9, 3, -3, -9, -15]);

        const [result] = await db.select().from(matchResults).where(eq(matchResults.matchId, matchId));
        expect(result.results).toHaveLength(6);

        const [row] = await db.select().from(matches).where(eq(matches.id, matchId));
        expect(row.status).toBe("FINISHED");
    });

    it("writes the crowd-weighted points on the answer rows", async () => {
        const rows = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.userId, playerIds[0])
        ));
        expect(rows).toHaveLength(5);
        // Player 0 answered every question right; each question was worth y + z.
        expect(rows.map((row) => row.pointsAwarded ?? 0).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });

    it("refuses to close twice", async () => {
        const res = await close(matchId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("CLOSED");
    });

    it("refuses further answers once closed", async () => {
        const res = await answer(matchId, playerCookies[2], questionIds[0], "a");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("CLOSED");
    });

    it("is never played live", async () => {
        const res = await app.inject({
            method: "PATCH",
            url: seasonUrl(`/matches/${matchId}/status`),
            headers: auth(ownerCookie),
            payload: { status: "LIVE" }
        });
        expect(res.statusCode).toBe(409);
    });

    it("does not count towards the standings", async () => {
        const res = await app.inject({
            method: "GET", url: seasonUrl("/standings"), headers: auth(ownerCookie)
        });
        expect(res.statusCode).toBe(200);

        // The roster is listed, but nobody has a place and nobody has played a points
        // match: the mass event ranks the field, it is not a match for points.
        const rows = res.json().rows as Array<{
            place: number | null;
            matchesPlayed: number;
        }>;
        expect(rows).toHaveLength(6);
        for (const row of rows) {
            expect(row.place).toBeNull();
            expect(row.matchesPlayed).toBe(0);
        }
    });
});
