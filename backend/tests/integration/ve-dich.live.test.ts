import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { answers, matchEvents, matchLive, matchResults, matchStats, matches, seasons, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";

// ve-dich end to end: phase 1 typed (pick → draft → controller finalizes), phase 2 oral
// with a buzz window and powers.

const DOMAINS = ["THTH", "TNSS", "XHPL", "VHNT", "TTGT", "KTTH"];
const VALUES = [50, 40, 30, 20];

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let tournamentId: string;
let seasonId: string;
let matchId: string;
let playerIds: string[];
const qid = new Map<string, string>();     // "THTH-50" -> question id

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const question = (domain: string, value: number, position: number): MatchQuestion => ({
    _id: randomUUID(), roundId: "ve-dich", turnId: "grid", position, mode: "text", kind: "TEXT",
    questionText: `${domain} ${value}`, media: null, timeLimit: null, points: value, tag: domain,
    payload: { acceptedAnswers: ["x"], normalize: { caseSensitive: false, trim: true, stripAccents: true } },
    sourceId: randomUUID()
});

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "vd-owner", displayName: "VD Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const playerRows = await db.insert(users).values([
        { role: "PLAYER", email: "vd1@example.com", displayName: "VD1", tokenVersion: 0 },
        { role: "PLAYER", email: "vd2@example.com", displayName: "VD2", tokenVersion: 0 }
    ]).returning();
    playerIds = playerRows.map((u) => u.id);
    playerCookies = playerRows.map((u) => signToken(app, "GAMEPLAY", { sub: u.id, role: "PLAYER", tokenVersion: 0 }));

    const [tournament] = await db.insert(tournaments).values({
        name: "VD Tournament", slug: "vd-tournament", visibility: "PUBLIC", ownerId: owner.id,
        defaultTags: ["THTH"],
        defaultRounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        defaultFormat: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        defaultPlacementTiers: [{ min: 1, max: 2, points: 10 }]
    }).returning();
    tournamentId = tournament.id;

    const [season] = await db.insert(seasons).values({
        tournamentId, name: "VD Season",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();
    seasonId = season.id;

    const questions: MatchQuestion[] = [];
    let position = 0;
    for (const domain of DOMAINS) {
        for (const value of VALUES) {
            const q = question(domain, value, position++);
            questions.push(q);
            qid.set(`${domain}-${value}`, q._id);
        }
    }

    const [match] = await db.insert(matches).values({
        seasonId, stageId: "s1", scheduledAt: new Date(), label: "VD Match", status: "LIVE",
        players: [
            { kind: "user", userId: playerIds[0], seed: 1 },
            { kind: "user", userId: playerIds[1], seed: 2 }
        ],
        roundConfigs: {
            "ve-dich": { allowedKinds: ["TEXT"], scoring: { template: "constant", points: 0 }, turns: [] }
        },
        questions
    }).returning();
    matchId = match.id;

    await db.insert(matchLive).values({ matchId, version: 0, roundId: "ve-dich", state: {} });
});

afterAll(async () => {
    await app.close();
});

const actionUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/live`;
const statusUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/status`;
const commandUrl = () => `/gameplay/matches/${matchId}/live/commands`;
const answerUrl = () => `/gameplay/matches/${matchId}/live/answers`;

async function live(): Promise<{ version: number; roundId: string; state: Record<string, any> }> {
    const res = await app.inject({ method: "GET", url: liveUrl(), headers: auth(ownerCookie) });
    return res.json();
}
async function act(action: unknown) {
    const { version } = await live();
    return app.inject({
        method: "POST", url: actionUrl(), headers: auth(ownerCookie),
        payload: { expectedVersion: version, action }
    });
}
const command = (cookie: string, body: unknown) =>
    app.inject({ method: "POST", url: commandUrl(), headers: asPlayer(cookie), payload: body as object });
const answer = (cookie: string, questionId: string, text: string) =>
    app.inject({
        method: "POST", url: answerUrl(), headers: asPlayer(cookie),
        payload: { questionId, value: { text } }
    });

async function score(playerId: string): Promise<number> {
    const state = (await live()).state;
    return state.players.find((p: { id: string }) => p.id === playerId).score;
}

describe("ve-dich — start", () => {
    it("builds the 24-question grid and both powers per player", async () => {
        const res = await act({ kind: "ve-dich.start" });
        expect(res.statusCode).toBe(200);
        const state = res.json().state;
        expect(state.phase).toBe(1);
        expect(state.remaining).toHaveLength(24);
        expect(state.players.map((p: { id: string }) => p.id)).toEqual(playerIds);
        expect(state.players.every((p: { powersLeft: string[] }) => p.powersLeft.length === 2)).toBe(true);
    });
});

describe("ve-dich — phase 1 (typed, one pick each)", () => {
    it("only the current player may pick", async () => {
        const res = await command(playerCookies[1], { type: "pick", questionId: qid.get("THTH-50") });
        expect(res.statusCode).toBe(409);
    });

    it("player 0 picks, answers, and the controller finalizes it", async () => {
        const picked = await command(playerCookies[0], { type: "pick", questionId: qid.get("THTH-50") });
        expect(picked.statusCode).toBe(200);
        expect(picked.json()).toEqual({ applied: "pick" });

        const drafted = await answer(playerCookies[0], qid.get("THTH-50")!, "x");
        expect(drafted.statusCode).toBe(200);
        expect(drafted.json()).toMatchObject({ drafted: true, suggested: "CORRECT" });

        const resolved = await act({ kind: "ve-dich.resolve", answerer: true });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[0])).toBe(50);

        const [row] = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.questionId, qid.get("THTH-50")!),
            eq(answers.userId, playerIds[0])
        ));
        expect(row).toMatchObject({ judged: true, verdict: "CORRECT", pointsAwarded: 50 });
    });

    it("player 1 picks, never answers, and is still scored for it", async () => {
        expect((await act({ kind: "ve-dich.advanceTurn" })).statusCode).toBe(200);
        expect((await command(playerCookies[1], { type: "pick", questionId: qid.get("TNSS-50") })).statusCode).toBe(200);

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[1])).toBe(-25);      // -50% of 50

        const [row] = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.questionId, qid.get("TNSS-50")!),
            eq(answers.userId, playerIds[1])
        ));
        // no typed answer: the verdict is recorded as an operator row, not a judge of a draft
        expect(row).toMatchObject({ judged: true, verdict: "INCORRECT", pointsAwarded: -25, autoMatched: false });
    });

    it("records a PICK event per pick", async () => {
        const events = await db.select().from(matchEvents)
            .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.kind, "PICK")));
        expect(events).toHaveLength(2);
        expect(events.every((e) => (e.payload as { turnId: string }).turnId === "phase-1")).toBe(true);
    });
});

describe("ve-dich — phase 2 (oral, buzz, powers)", () => {
    it("opens phase 2 with the lowest score first", async () => {
        expect((await act({ kind: "ve-dich.advanceTurn" })).statusCode).toBe(200);

        const res = await act({ kind: "ve-dich.beginPhase2" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.phase).toBe(2);
        expect(res.json().state.players.map((p: { id: string }) => p.id)).toEqual([playerIds[1], playerIds[0]]);
    });

    it("the current player picks three questions", async () => {
        const res = await command(playerCookies[1], {
            type: "pickBatch",
            questionIds: [qid.get("THTH-40"), qid.get("TNSS-40"), qid.get("XHPL-40")]
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ applied: "pickBatch" });

        const events = await db.select().from(matchEvents)
            .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.kind, "PICK")));
        expect(events).toHaveLength(5);                    // 2 from phase 1 + 3 now
    });

    it("the answerer and the buzzer are scored independently", async () => {
        expect((await act({ kind: "ve-dich.openQuestion", questionId: qid.get("THTH-40") })).statusCode).toBe(200);
        expect((await act({ kind: "ve-dich.closeCurrentAnswer" })).statusCode).toBe(200);

        const buzzed = await command(playerCookies[0], { type: "buzz", questionId: qid.get("THTH-40") });
        expect(buzzed.statusCode).toBe(200);
        expect(buzzed.json()).toEqual({ applied: "buzz" });

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false, buzzer: true });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[1])).toBe(-45);       // -25 - 20
        expect(await score(playerIds[0])).toBe(90);        //  50 + 40
    });

    it("a buzzer who buzzes twice, or a non-buzzer, is rejected", async () => {
        // The window is still open on this question; the engine allows only one buzzer.
        const again = await command(playerCookies[1], { type: "buzz", questionId: qid.get("THTH-40") });
        expect(again.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("HOPE (wrong) costs -100% of face value", async () => {
        expect((await act({ kind: "ve-dich.openQuestion", questionId: qid.get("TNSS-40") })).statusCode).toBe(200);
        expect((await command(playerCookies[1], { type: "power", power: "HOPE" })).statusCode).toBe(200);
        expect((await act({ kind: "ve-dich.closeCurrentAnswer" })).statusCode).toBe(200);

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[1])).toBe(-85);       // -45 - 40
    });

    it("SHIELD (wrong) costs nothing — and a second power is allowed in the same round", async () => {
        expect((await act({ kind: "ve-dich.openQuestion", questionId: qid.get("XHPL-40") })).statusCode).toBe(200);
        const shielded = await command(playerCookies[1], { type: "power", power: "SHIELD" });
        expect(shielded.statusCode).toBe(200);
        expect((await act({ kind: "ve-dich.closeCurrentAnswer" })).statusCode).toBe(200);

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[1])).toBe(-85);       // unchanged: SHIELD absorbs it

        // Both powers inserted for the same player in one round: this is what migration
        // 0006 fixed (the old index allowed one power per round).
        const powers = await db.select().from(matchEvents)
            .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.kind, "POWER")));
        expect(powers).toHaveLength(2);
        expect(powers.map((p) => (p.payload as { power: string }).power).sort()).toEqual(["HOPE", "SHIELD"]);
    });
});

describe("ve-dich — round end and results", () => {
    it("the controller ends the round", async () => {
        const res = await act({ kind: "ve-dich.endRound" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.ended).toBe(true);
    });

    it("advancing past the last round returns 409 NO_NEXT_ROUND", async () => {
        const res = await act({ kind: "round.advance" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_NEXT_ROUND");
    });

    it("finishing the match folds ve-dich into the result, signed points included", async () => {
        const res = await app.inject({
            method: "PATCH", url: statusUrl(), headers: auth(ownerCookie),
            payload: { status: "FINISHED" }
        });
        expect(res.statusCode).toBe(200);

        const [row] = await db.select().from(matchResults).where(eq(matchResults.matchId, matchId));
        const p0 = row.results.find((r) => r.userId === playerIds[0])!;
        const p1 = row.results.find((r) => r.userId === playerIds[1])!;

        expect(p0).toMatchObject({ totalScore: 90, rank: 1 });
        expect(p1).toMatchObject({ totalScore: -85, rank: 2 });
        expect(p1.roundScores).toEqual({ "ve-dich": -85 });

        const stats = await db.select().from(matchStats).where(eq(matchStats.matchId, matchId));
        expect(stats).toHaveLength(6);      // 2 in phase 1 + 2 (answerer + buzzer) + 1 + 1
    });
});
