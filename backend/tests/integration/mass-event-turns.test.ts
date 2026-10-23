import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matchClocks, matches, questionBank, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// Synchronized turns: the staff release the questions one at a time; players answer
// only the current one; future questions never leave the server; the clock is the
// release. See docs/mass-event.md for the decisions behind these rules.

let app: FastifyInstance;
let baseUrl: string;
let ownerCookie: string;
let playerCookies: string[];
let outsiderCookie: string;
let tournamentId: string;
let playerIds: string[];
let matchId: string;
let questionIds: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const url = (suffix: string) => `/portal/tournaments/${tournamentId}${suffix}`;

const createEvent = async (questionCount = 3): Promise<string> => {
    const res = await app.inject({
        method: "POST",
        url: url("/qualification-matches"),
        headers: auth(ownerCookie),
        payload: {
            label: "Turns",
            scheduledAt: "2026-11-01T19:00:00.000Z",
            questionCount
        }
    });
    if (res.statusCode !== 201) throw new Error(`create: ${res.statusCode} ${res.body}`);
    const id = res.json().id as string;
    const [row] = await db.select().from(matches).where(eq(matches.id, id));
    questionIds = row.questions.map((question) => question._id);
    return id;
};

const open = (id: string) =>
    app.inject({ method: "POST", url: url(`/qualification-matches/${id}/open`), headers: auth(ownerCookie) });

const advance = (id: string) =>
    app.inject({ method: "POST", url: url(`/qualification-matches/${id}/advance`), headers: auth(ownerCookie) });

const close = (id: string) =>
    app.inject({ method: "POST", url: url(`/qualification-matches/${id}/close`), headers: auth(ownerCookie), payload: {} });

const view = (id: string, cookie: string) =>
    app.inject({ method: "GET", url: `/gameplay/matches/${id}/qualification`, headers: asPlayer(cookie) });

const answer = (id: string, cookie: string, questionId: string, picked: string) =>
    app.inject({
        method: "POST",
        url: `/gameplay/matches/${id}/qualification/answers`,
        headers: asPlayer(cookie),
        payload: { questionId, value: { picked: [picked] } }
    });

const staffView = (id: string) =>
    app.inject({ method: "GET", url: url(`/qualification-matches/${id}`), headers: auth(ownerCookie) });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `ws://127.0.0.1:${port}`;

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "turns-owner", displayName: "Turns Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 3 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `turns${i}@example.com`,
            displayName: `Turns${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);
    playerCookies = players.map((row) =>
        signToken(app, "GAMEPLAY", { sub: row.id, role: "PLAYER", tokenVersion: 0 }));

    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: "turns-outsider@example.com", displayName: "Out", tokenVersion: 0
    }).returning();
    outsiderCookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });

    const [tournament] = await db.insert(tournaments).values({
        ownerId: owner.id, visibility: "PUBLIC", tags: ["THTH"],
        slug: "turns-tournament-tournament", name: "Turns Tournament",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: {
            competitorsPerMatch: 4, allowedSeatKinds: ["user"], teamSize: null,
            teamAggregation: null, teamCountAggregation: null
        },
        placementTiers: [{ min: 1, max: 1, points: 10 }],
        stages: []
    }).returning();
    tournamentId = tournament.id;

    const enrolled = await app.inject({
        method: "POST", url: url("/players"), headers: auth(ownerCookie),
        payload: { userIds: playerIds }
    });
    expect(enrolled.statusCode).toBe(200);

    await db.insert(questionBank).values(
        Array.from({ length: 5 }, (_, i) => ({
            kind: "MC" as const,
            questionText: `T${i}`,
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
    await db.$client.end();
});


describe("the turns — nothing is out until the staff open", () => {
    it("player GET answers NOT_OPEN and writes nothing", async () => {
        matchId = await createEvent(3);

        const before = await view(matchId, playerCookies[0]);
        expect(before.statusCode).toBe(409);
        expect(before.json().error).toBe("NOT_OPEN");

        // Polling the closed gate must not touch any clock — the clock is the release.
        const clocks = await db.select().from(matchClocks);
        expect(clocks).toHaveLength(0);

        const again = await view(matchId, playerCookies[0]);
        expect(again.statusCode).toBe(409);
    });

    it("answering before open is refused", async () => {
        const res = await answer(matchId, playerCookies[0], questionIds[0], "a");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_OPEN");
    });

    it("advancing before open is refused", async () => {
        const res = await advance(matchId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_OPEN");
    });

    it("open releases question 1 — and only question 1", async () => {
        const res = await open(matchId);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ opened: true, currentPosition: 0, currentAnswered: 0 });
        expect(res.json().releasedAt).toBeTruthy();

        const player = await view(matchId, playerCookies[0]);
        expect(player.statusCode).toBe(200);
        const body = player.json();
        // Read-ahead protection: one question out, the rest a count only.
        expect(body.questions).toHaveLength(1);
        expect(body.questions[0].position).toBe(0);
        expect(body.currentPosition).toBe(0);
        expect(body.totalQuestions).toBe(3);
    });

    it("opening twice is a conflict", async () => {
        const res = await open(matchId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("CONFLICT");
    });

    it("the player who is not seated is refused before anything else", async () => {
        const res = await view(matchId, outsiderCookie);
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("NOT_ENROLLED");
    });
});


describe("the turns — answering follows the release", () => {
    it("the current question answers and double-submit is refused", async () => {
        const first = await answer(matchId, playerCookies[0], questionIds[0], "a");
        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ verdict: "CORRECT" });

        const again = await answer(matchId, playerCookies[0], questionIds[0], "b");
        expect(again.statusCode).toBe(409);
        expect(again.json().error).toBe("ALREADY_ANSWERED");
    });

    it("a future question does not exist for a player", async () => {
        // The client knows the id only by cheating; the server refuses either way.
        const res = await answer(matchId, playerCookies[1], questionIds[2], "a");
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe("NOT_FOUND");
    });

    it("advance releases the next and the old one locks as missed", async () => {
        const res = await advance(matchId);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ opened: true, currentPosition: 1 });

        const player = await view(matchId, playerCookies[1]);
        const body = player.json();
        expect(body.questions).toHaveLength(2);
        expect(body.currentPosition).toBe(1);

        // Player 1 never answered question 1: it is now closed to them — 409,
        // and no answer row appears (scoring counts it as silent → 0).
        const missed = await answer(matchId, playerCookies[1], questionIds[0], "a");
        expect(missed.statusCode).toBe(409);
        expect(missed.json().error).toBe("CLOSED");
    });

    it("advancing past the last question is a conflict", async () => {
        const toLast = await advance(matchId); // position 2, the last of 3
        expect(toLast.statusCode).toBe(200);
        expect(toLast.json().currentPosition).toBe(2);

        const past = await advance(matchId);
        expect(past.statusCode).toBe(409);
        expect(past.json().error).toBe("CONFLICT");
    });

    it("the staff view counts answers to the CURRENT question only", async () => {
        // Everyone answers the current (last) question; player 0 also catches up on
        // it so the three totals end up strictly distinct (3 / 1 / -2) — close must
        // never depend on a millisecond tie-break to rank the field.
        expect((await answer(matchId, playerCookies[0], questionIds[2], "a")).statusCode).toBe(200);
        expect((await answer(matchId, playerCookies[1], questionIds[2], "a")).statusCode).toBe(200);
        expect((await answer(matchId, playerCookies[2], questionIds[2], "b")).statusCode).toBe(200);

        const res = await staffView(matchId);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            opened: true,
            currentPosition: 2,
            questionCount: 3,
            currentAnswered: 3 // the whole field has answered the current question
        });
        // The field keeps per-player totals across ALL questions.
        const p0 = res.json().field.find((row: { userId: string }) => row.userId === playerIds[0]);
        expect(p0.answered).toBe(2); // question 1, then the current — question 2 was missed
    });

    it("close ends it; a released set smaller than the set is honest", async () => {
        const res = await close(matchId);
        expect(res.statusCode).toBe(200);

        // The event closed with all 3 released — the view says closed, points arrive.
        const player = await view(matchId, playerCookies[0]);
        const body = player.json();
        expect(body.closed).toBe(true);
        expect(body.questions).toHaveLength(3);
        expect(body.totalQuestions).toBe(3);
        const answered = body.answers as Array<{ pointsAwarded: number; verdict: string; value: { picked?: string[] } }>;
        expect(answered.every((row) => row.pointsAwarded !== 0)).toBe(true);
        // Review after a reload shows the player their OWN pick.
        const mine = answered.find((row) => row.value.picked);
        expect(mine).toBeDefined();
        expect(mine!.verdict).toMatch(/CORRECT|INCORRECT/);
    });
});


describe("the turn channel — the socket", () => {
    // The listener attaches AT CONSTRUCTION: the server sends its sync snapshot the
    // instant the upgrade lands, and a listener attached after the "open" await can
    // miss it (ws may emit open and message in one tick). Buffer, then read by type.
    function inbox(socket: WebSocket) {
        const queue: Record<string, unknown>[] = [];
        socket.on("message", (raw) => queue.push(JSON.parse(String(raw))));

        async function next(type: string, timeoutMs = 2000): Promise<Record<string, unknown>> {
            const deadline = Date.now() + timeoutMs;
            while (Date.now() < deadline) {
                const index = queue.findIndex((message) => message.type === type);
                if (index !== -1) return queue.splice(index, 1)[0];
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
            throw new Error(`no "${type}" message within ${timeoutMs}ms`);
        }

        return { next };
    }

    const nextClose = (socket: WebSocket): Promise<{ code: number }> =>
        new Promise((resolve) => {
            socket.once("close", (code) => resolve({ code }));
        });

    it("sync on connect, refresh on open/advance/close", async () => {
        const id = await createEvent(2);

        const socket = new WebSocket(`${baseUrl}/gameplay/matches/${id}/qualification/stream`, {
            headers: { cookie: `gameplay_session=${playerCookies[0]}` }
        });
        const messages = inbox(socket);
        await new Promise((resolve, reject) => {
            socket.once("open", resolve);
            socket.once("error", reject);
        });

        // Subscribe happened before the read: the snapshot is the pre-open state.
        const sync = await messages.next("sync");
        expect(sync).toMatchObject({ type: "sync", open: false, closed: false, currentPosition: null });

        await open(id);
        expect(await messages.next("refresh")).toEqual({ type: "refresh" });

        await advance(id);
        expect(await messages.next("refresh")).toEqual({ type: "refresh" });

        // Answer so close ranks the field outright (2 / -2 / 0) — an all-silent
        // field would tie and refuse to close without an explicit order.
        expect((await answer(id, playerCookies[0], questionIds[1], "a")).statusCode).toBe(200);
        expect((await answer(id, playerCookies[1], questionIds[1], "b")).statusCode).toBe(200);

        await close(id);
        expect(await messages.next("refresh")).toEqual({ type: "refresh" });

        socket.close();
    });

    it("a player who is not seated gets the close code, not the channel", async () => {
        const id = await createEvent(2);

        const socket = new WebSocket(`${baseUrl}/gameplay/matches/${id}/qualification/stream`, {
            headers: { cookie: `gameplay_session=${outsiderCookie}` }
        });
        const closed = await nextClose(socket);
        expect(closed.code).toBe(4403); // CLOSE_CODES.NOT_SEATED
    });
});
