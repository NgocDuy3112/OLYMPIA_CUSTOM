import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { answers, matchEvents, matchLive, matchResults, matchStats, matches, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";

// ve-dich end to end: phase 1 typed (pick → draft → controller finalizes), phase 2 oral
// with a buzz window and powers.

// The show's board — 6×20, 6×30, 4×40, 4×50 — and the engine refuses anything
// else at start, so this fixture IS the round's composition.
const BOARD: Array<[string, number]> = [
    ["THTH", 20], ["TNSS", 20], ["XHPL", 20], ["VHNT", 20], ["TTGT", 20], ["KTTH", 20],
    ["THTH", 30], ["TNSS", 30], ["XHPL", 30], ["VHNT", 30], ["TTGT", 30], ["KTTH", 30],
    ["THTH", 40], ["TNSS", 40], ["XHPL", 40], ["VHNT", 40],
    ["THTH", 50], ["TNSS", 50], ["XHPL", 50], ["VHNT", 50]
];

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let tournamentId: string;
let matchId: string;
let playerIds: string[];
const qid = new Map<string, string>();     // "THTH-50" -> question id

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const question = (label: string, value: number, position: number): MatchQuestion => ({
    _id: randomUUID(), roundId: "ve-dich", turnId: "grid", position, mode: "text", kind: "TEXT",
    questionText: `${label} ${value}`, media: null, timeLimit: null, points: value,
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

    // The tournament is the unit: it carries the identity the tournament had.
    const tournamentTags = ["THTH"];
    const tournamentOwner = owner.id;
    const tournamentSlug = "vd-tournament-tournament";

    const [tournament] = await db.insert(tournaments).values({
        ownerId: tournamentOwner, visibility: "PUBLIC", slug: tournamentSlug,
        name: "VD Tournament",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: { competitorsPerMatch: 2 },
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();
    tournamentId = tournament.id;

    const questions: MatchQuestion[] = [];
    let position = 0;
    for (const [label, value] of BOARD) {
        const q = question(label, value, position++);
        questions.push(q);
        qid.set(`${label}-${value}`, q._id);
    }

    const [match] = await db.insert(matches).values({
        tournamentId, stageId: "s1", scheduledAt: new Date(), label: "VD Match", status: "LIVE",
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

const actionUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live`;
const statusUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/status`;
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
    it("builds the board: 12 cells for Chung, 8 deferred for the summit", async () => {
        const res = await act({ kind: "ve-dich.start" });
        expect(res.statusCode).toBe(200);
        const state = res.json().state;
        expect(state.phase).toBe(1);
        expect(state.remaining).toHaveLength(12);   // Chung: six 20s + six 30s
        expect(state.deferred).toHaveLength(8);     // Riêng: four 40s + four 50s
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
        const picked = await command(playerCookies[0], { type: "pick", questionId: qid.get("THTH-30") });
        expect(picked.statusCode).toBe(200);
        expect(picked.json()).toEqual({ applied: "pick" });

        const drafted = await answer(playerCookies[0], qid.get("THTH-30")!, "x");
        expect(drafted.statusCode).toBe(200);
        expect(drafted.json()).toEqual({ drafted: true });            // opinion stays server-side

        const resolved = await act({ kind: "ve-dich.resolve", answerer: true });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[0])).toBe(30);

        const [row] = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.questionId, qid.get("THTH-30")!),
            eq(answers.userId, playerIds[0])
        ));
        expect(row).toMatchObject({ judged: true, verdict: "CORRECT", pointsAwarded: 30 });
    });

    it("player 1 picks, never answers, and is still scored for it", async () => {
        expect((await act({ kind: "ve-dich.advanceTurn" })).statusCode).toBe(200);
        expect((await command(playerCookies[1], { type: "pick", questionId: qid.get("TNSS-30") })).statusCode).toBe(200);

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[1])).toBe(-15);      // -50% of 30

        const [row] = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.questionId, qid.get("TNSS-30")!),
            eq(answers.userId, playerIds[1])
        ));
        // no typed answer: the verdict is recorded as an operator row, not a judge of a draft
        expect(row).toMatchObject({ judged: true, verdict: "INCORRECT", pointsAwarded: -15, autoMatched: false });
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
        expect(await score(playerIds[1])).toBe(-35);       // -15 - 20
        expect(await score(playerIds[0])).toBe(70);        //  30 + 40
    });

    it("a buzzer who buzzes twice, or a non-buzzer, is rejected", async () => {
        // The window is still open on this question; the engine allows only one buzzer.
        const again = await command(playerCookies[1], { type: "buzz", questionId: qid.get("THTH-40") });
        expect(again.statusCode).toBeGreaterThanOrEqual(400);
    });

    it("STAR (wrong) costs -100% of face value", async () => {
        expect((await act({ kind: "ve-dich.openQuestion", questionId: qid.get("TNSS-40") })).statusCode).toBe(200);
        // The CONSOLE declares for the turn player — the show deck is the
        // operator's door. Regression: this kind was missing from
        // LiveActionSchema, so every console declare used to 400 at the route
        // before reaching the engine. (The player's own `power` command stays
        // covered by the ASSIGN test below.)
        const declared = await act({
            kind: "ve-dich.declarePower",
            playerId: playerIds[1],          // the turn player — the engine still checks NOT_YOUR_TURN
            power: "STAR"
        });
        expect(declared.statusCode).toBe(200);
        expect((await act({ kind: "ve-dich.closeCurrentAnswer" })).statusCode).toBe(200);

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[1])).toBe(-75);       // -35 - 40
    });

    it("ASSIGN hands the question to a partner, and the pair duel for it", async () => {
        expect((await act({ kind: "ve-dich.openQuestion", questionId: qid.get("XHPL-40") })).statusCode).toBe(200);

        // The current player (1) hands the question to (0). That IS the race start:
        // there is nobody to "answer first" in a duel.
        const assigned = await command(playerCookies[1], {
            type: "power", power: "ASSIGN", targetId: playerIds[0]
        });
        expect(assigned.statusCode).toBe(200);

        // Only the two halves may buzz; the partner takes it.
        const buzzed = await command(playerCookies[0], { type: "buzz", questionId: qid.get("XHPL-40") });
        expect(buzzed.statusCode).toBe(200);

        const resolved = await act({ kind: "ve-dich.resolve", answerer: false, buzzer: true });
        expect(resolved.statusCode).toBe(200);
        expect(await score(playerIds[0])).toBe(110);      // the buzzer: +100% of 40
        expect(await score(playerIds[1])).toBe(-95);      // the assigner: −50% of 40

        // The POWER event names the partner: the duel is auditable.
        const powers = (await db.select().from(matchEvents)
            .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.kind, "POWER"))))
            .map((row) => row.payload as { power: string; targetId?: string });
        expect(powers).toContainEqual({ kind: "POWER", power: "ASSIGN", targetId: playerIds[0] });
    });

    it("both powers are spent once used — the state says so", async () => {
        const state = (await live()).state;
        const mine = state.players.find((p: { id: string }) => p.id === playerIds[1]);
        expect(mine.powersLeft).toEqual([]);
    });
});

describe("ve-dich — round end and results", () => {
    it("the controller ends the round", async () => {
        const res = await act({ kind: "ve-dich.endRound" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.ended).toBe(true);
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

        expect(p0).toMatchObject({ totalScore: 110, rank: 1 });
        expect(p1).toMatchObject({ totalScore: -95, rank: 2 });
        expect(p1.roundScores).toEqual({ "ve-dich": -95 });

        // 2 in phase 1 · 2 in the buzz question · 1 STAR · 2 for the ASSIGN duel
        const stats = await db.select().from(matchStats).where(eq(matchStats.matchId, matchId));
        expect(stats).toHaveLength(7);
    });
});
