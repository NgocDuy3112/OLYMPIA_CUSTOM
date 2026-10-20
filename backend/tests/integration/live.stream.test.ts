import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matchLive, matches, seasons, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import { openHint, startGiaiMa } from "../../src/game/engine/turns/giai-ma.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";

// The realtime channel needs a listening server: app.inject cannot upgrade a socket.

let app: FastifyInstance;
let ownerCookie: string;
let playerCookie: string;
let outsiderCookie: string;
let tournamentId: string;
let seasonId: string;
let matchId: string;
let hintIds: string[];
let baseUrl: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const hintQuestion = (position: number): MatchQuestion => ({
    _id: randomUUID(), roundId: "giai-ma", turnId: "hints", position, mode: "text", kind: "TEXT",
    questionText: `Hint ${position}`, media: null, timeLimit: null, points: 0, tag: "THTH",
    payload: { acceptedAnswers: ["x"], normalize: { caseSensitive: false, trim: true, stripAccents: true } },
    sourceId: randomUUID()
});

beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `ws://127.0.0.1:${port}`;

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "stream-owner", displayName: "Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const [player] = await db.insert(users).values({
        role: "PLAYER", email: "streamer@example.com", displayName: "Streamer", tokenVersion: 0
    }).returning();
    playerCookie = signToken(app, "GAMEPLAY", { sub: player.id, role: "PLAYER", tokenVersion: 0 });

    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: "stream-outsider@example.com", displayName: "Out", tokenVersion: 0
    }).returning();
    outsiderCookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });

    const [tournament] = await db.insert(tournaments).values({
        name: "Stream Tournament", slug: "stream-tournament", visibility: "PUBLIC", ownerId: owner.id,
        defaultTags: ["THTH"],
        defaultRounds: [{ id: "giai-ma", name: "Giai Ma", order: 0, chart: "bars" }],
        defaultFormat: { competitorsPerMatch: 1, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        defaultPlacementTiers: [{ min: 1, max: 1, points: 10 }]
    }).returning();
    tournamentId = tournament.id;

    const [season] = await db.insert(seasons).values({
        tournamentId, name: "Stream Season",
        rounds: [{ id: "giai-ma", name: "Giai Ma", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: 1, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 1, points: 10 }],
        stages: []
    }).returning();
    seasonId = season.id;

    const hints = [1, 2, 3, 4, 5, 6, 7, 8].map(hintQuestion);
    hintIds = hints.map((q) => q._id);

    const [match] = await db.insert(matches).values({
        seasonId, stageId: "s1", scheduledAt: new Date(), label: "Stream Match", status: "LIVE",
        players: [{ kind: "user", userId: player.id, seed: 1 }],
        roundConfigs: { "giai-ma": { allowedKinds: ["TEXT"], scoring: { template: "keyword_derived", initial: 100, dropPerHint: 10, incorrect: 0 }, turns: [] } },
        questions: hints
    }).returning();
    matchId = match.id;

    // A round already started, with the first hint's window open.
    const started: Record<string, unknown> = openHint(
        startGiaiMa([player.id], hintIds), hintIds[0], new Date().toISOString()
    ) as unknown as Record<string, unknown>;

    await db.insert(matchLive).values({ matchId, version: 0, roundId: "giai-ma", state: started });
});

afterAll(async () => {
    await app.close();
});

const streamUrl = () => `${baseUrl}/gameplay/matches/${matchId}/live/stream`;
const actionUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/live`;

function nextMessage(socket: WebSocket, timeoutMs = 3000): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("no message within timeout")), timeoutMs);
        socket.once("message", (data) => {
            clearTimeout(timer);
            resolve(JSON.parse(String(data)));
        });
    });
}

// A submission produces a result message AND a pushed view, so read by type, not order.
function inbox(socket: WebSocket) {
    const queue: any[] = [];
    socket.on("message", (data) => queue.push(JSON.parse(String(data))));

    return async function next(type: string, timeoutMs = 3000): Promise<any> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const index = queue.findIndex((m) => m.type === type);
            if (index !== -1) return queue.splice(index, 1)[0];
            await new Promise((r) => setTimeout(r, 10));
        }
        throw new Error(`no "${type}" message within ${timeoutMs}ms`);
    };
}

function connect(cookie: string): Promise<WebSocket> {
    const socket = new WebSocket(streamUrl(), { headers: { cookie: `gameplay_session=${cookie}` } });
    return new Promise((resolve, reject) => {
        socket.once("open", () => resolve(socket));
        socket.once("error", reject);
    });
}

async function act(action: unknown) {
    const res = await app.inject({ method: "GET", url: liveUrl(), headers: auth(ownerCookie) });
    const version = res.json().version as number;
    return app.inject({
        method: "POST", url: actionUrl(), headers: auth(ownerCookie),
        payload: { expectedVersion: version, action }
    });
}

describe("live stream — a connected player", () => {
    it("receives its view as soon as it connects", async () => {
        const socket = await connect(playerCookie);
        const message = await nextMessage(socket);
        expect(message.type).toBe("view");
        expect(message.data.view.roundId).toBe("giai-ma");
        expect(message.data.view.open[0].questionId).toBe(hintIds[0]);
        socket.close();
    });

    it("is pushed an updated view when the controller changes the round", async () => {
        const socket = await connect(playerCookie);
        await nextMessage(socket);                              // the opening snapshot

        const pushed = nextMessage(socket);
        const res = await act({ kind: "giai-ma.resolveHint" }); // closes the window
        expect(res.statusCode).toBe(200);

        const update = await pushed;
        expect(update.type).toBe("view");
        expect(update.data.view.open).toEqual([]);
        expect(update.data.view.version).toBeGreaterThan(0);
        socket.close();
    });
});

describe("live stream — authorisation", () => {
    it("closes the socket for a player who is not seated", async () => {
        const socket = new WebSocket(streamUrl(), { headers: { cookie: `gameplay_session=${outsiderCookie}` } });
        const code = await new Promise<number>((resolve) => socket.once("close", resolve));
        expect(code).toBe(4403);
    });

    it("refuses a connection with no session", async () => {
        const socket = new WebSocket(streamUrl());
        await new Promise<void>((resolve) => {
            socket.once("error", () => resolve());
            socket.once("close", () => resolve());
        });
        expect(socket.readyState).not.toBe(WebSocket.OPEN);
    });
});

describe("live stream — submitting over the socket", () => {
    it("the MC opens a fresh window", async () => {
        const res = await act({ kind: "giai-ma.openHint", hintId: hintIds[1] });
        expect(res.statusCode).toBe(200);
    });

    it("a player submits an answer and receives the auto-matched result", async () => {
        const socket = await connect(playerCookie);
        const next = inbox(socket);
        await next("view");                                  // the snapshot

        socket.send(JSON.stringify({
            v: 1, type: "answer", requestId: "r1",
            data: { questionId: hintIds[1], value: { text: "x" } }
        }));

        const result = await next("ack");
        expect(result).toMatchObject({
            v: 1, type: "ack", requestId: "r1",
            data: { for: "answer", result: { correct: true } }
        });
        socket.close();
    });

    it("the submission is recorded, and the pushed view reflects it", async () => {
        const socket = await connect(playerCookie);
        const next = inbox(socket);
        const snapshot = await next("view");
        expect(snapshot.data.view.open[0].questionId).toBe(hintIds[1]);
        expect(snapshot.data.view.me.answerState).toBe("final");   // the previous test's answer
        socket.close();
    });

    it("a malformed message is answered with an error", async () => {
        const socket = await connect(playerCookie);
        const next = inbox(socket);
        await next("view");

        socket.send("not json at all");
        expect(await next("error")).toMatchObject({ type: "error", data: { code: "BAD_MESSAGE" } });
        socket.close();
    });

    it("an unknown message type is answered with an error", async () => {
        const socket = await connect(playerCookie);
        const next = inbox(socket);
        await next("view");

        socket.send(JSON.stringify({ v: 1, type: "wiggle", data: {} }));
        expect(await next("error")).toMatchObject({ type: "error", data: { code: "BAD_MESSAGE" } });
        socket.close();
    });

    it("submitting for a question with no open window is refused", async () => {
        const socket = await connect(playerCookie);
        const next = inbox(socket);
        await next("view");

        socket.send(JSON.stringify({
            v: 1, type: "answer", data: { questionId: hintIds[5], value: { text: "x" } }
        }));
        expect(await next("error")).toMatchObject({ type: "error", data: { code: "NO_WINDOW" } });
        socket.close();
    });

    it("a ve-dich command during a giai-ma round is refused", async () => {
        // The buzz envelope is valid, but this fixture is playing giai-ma: the round check
        // rejects it before the engine is ever consulted.
        const socket = await connect(playerCookie);
        const next = inbox(socket);
        await next("view");

        socket.send(JSON.stringify({ v: 1, type: "buzz", data: { questionId: hintIds[1] } }));
        expect(await next("error")).toMatchObject({ type: "error", data: { code: "NO_ROUND" } });
        socket.close();
    });

    it("a player who is not seated cannot submit; the socket is closed instead", async () => {
        const socket = new WebSocket(streamUrl(), { headers: { cookie: `gameplay_session=${outsiderCookie}` } });
        const code = await new Promise<number>((resolve) => socket.once("close", resolve));
        expect(code).toBe(4403);
    });
});
