import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { answers, matchLive, matchResults, matches, seasons, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";

// khoi-dong end to end: phase 1 oral (MC-recorded, 45 s per player), phase 2 typed
// (all players, one shared 60 s).

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let tournamentId: string;
let seasonId: string;
let matchId: string;
let playerIds: string[];
let phase1Ids: string[];
let phase2Ids: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const question = (turnId: string, position: number): MatchQuestion => ({
    _id: randomUUID(), roundId: "khoi-dong", turnId, position, mode: turnId === "phase1" ? "oral" : "text",
    kind: "TEXT", questionText: `${turnId} ${position}`, media: null, timeLimit: null, points: 10, tag: "THTH",
    payload: { acceptedAnswers: ["Hà Nội"], normalize: { caseSensitive: false, trim: true, stripAccents: true } },
    sourceId: randomUUID()
});

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "kd-owner", displayName: "KD Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const playerRows = await db.insert(users).values([
        { role: "PLAYER", email: "kd1@example.com", displayName: "KD1", tokenVersion: 0 },
        { role: "PLAYER", email: "kd2@example.com", displayName: "KD2", tokenVersion: 0 }
    ]).returning();
    playerIds = playerRows.map((u) => u.id);
    playerCookies = playerRows.map((u) => signToken(app, "GAMEPLAY", { sub: u.id, role: "PLAYER", tokenVersion: 0 }));

    const [tournament] = await db.insert(tournaments).values({
        name: "KD Tournament", slug: "kd-tournament", visibility: "PUBLIC", ownerId: owner.id,
        defaultTags: ["THTH"],
        defaultRounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
        defaultFormat: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        defaultPlacementTiers: [{ min: 1, max: 2, points: 10 }]
    }).returning();
    tournamentId = tournament.id;

    const [season] = await db.insert(seasons).values({
        tournamentId, name: "KD Season",
        rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: []
    }).returning();
    seasonId = season.id;

    const p1 = [1, 2, 3, 4, 5, 6].map((n) => question("phase1", n));
    const p2 = [1, 2, 3, 4, 5, 6].map((n) => question("phase2", n));
    phase1Ids = p1.map((q) => q._id);
    phase2Ids = p2.map((q) => q._id);

    const [match] = await db.insert(matches).values({
        seasonId, stageId: "s1", scheduledAt: new Date(), label: "KD Match", status: "LIVE",
        players: [
            { kind: "user", userId: playerIds[0], seed: 1 },
            { kind: "user", userId: playerIds[1], seed: 2 }
        ],
        roundConfigs: {
            "khoi-dong": {
                allowedKinds: ["TEXT"],
                scoring: { template: "constant", points: 10 },
                turns: [
                    { id: "phase1", mode: "oral", delivery: "sequential" },
                    { id: "phase2", mode: "text", delivery: "batch" }
                ]
            }
        },
        questions: [...p1, ...p2]
    }).returning();
    matchId = match.id;

    await db.insert(matchLive).values({ matchId, version: 0, roundId: "khoi-dong", state: {} });
});

afterAll(async () => {
    await app.close();
});

const actionUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/live`;
const answerUrl = () => `/gameplay/matches/${matchId}/live/answers`;
const statusUrl = () => `/portal/tournaments/${tournamentId}/seasons/${seasonId}/matches/${matchId}/status`;

async function live() {
    const res = await app.inject({ method: "GET", url: liveUrl(), headers: auth(ownerCookie) });
    return res.json() as { version: number; roundId: string; state: Record<string, unknown> };
}
async function act(action: unknown) {
    const { version } = await live();
    return app.inject({
        method: "POST", url: actionUrl(), headers: auth(ownerCookie),
        payload: { expectedVersion: version, action }
    });
}
const answer = (cookie: string, questionId: string, text: string) =>
    app.inject({
        method: "POST", url: answerUrl(), headers: asPlayer(cookie),
        payload: { questionId, value: { text } }
    });

describe("khoi-dong — phase 1 (oral, one run per player)", () => {
    it("the MC starts the round; every seated player gets a run", async () => {
        const res = await act({ kind: "khoi-dong.start" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.stage).toBe("phase1");
        expect(Object.keys(res.json().state.runs)).toEqual(playerIds);
        expect(res.json().state.runs[playerIds[0]].questionIds).toEqual(phase1Ids);
    });

    it("a player cannot submit in the oral phase", async () => {
        const res = await answer(playerCookies[0], phase1Ids[0], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().message).toContain("phase 2 is not open");
    });

    it("the MC records six correct answers for player 0, each worth 10", async () => {
        for (let i = 0; i < 6; i++) {
            const res = await act({ kind: "khoi-dong.recordOral", correct: true, spentS: 2 });
            expect(res.statusCode).toBe(200);
        }
        const state = (await live()).state as Record<string, unknown>;
        expect(state.activeIndex).toBe(1);                       // moved on to player 1
        const p0 = (state.runs as Record<string, { results: Record<string, { points: number }> }>)[playerIds[0]];
        expect(Object.values(p0.results).every((r) => r.points === 10)).toBe(true);

        // each oral answer is recorded as a fact
        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.userId, playerIds[0])));
        expect(rows).toHaveLength(6);
        expect(rows.every((r) => r.pointsAwarded === 10 && r.autoMatched === false)).toBe(true);
        // an oral answer is recorded as its own shape, never as empty text
        expect(rows.every((r) => JSON.stringify(r.value) === JSON.stringify({ oral: true }))).toBe(true);
    });

    it("the MC times out player 1's run; phase 1 is complete", async () => {
        const res = await act({ kind: "khoi-dong.timeOutRun" });
        expect(res.statusCode).toBe(200);
        const state = (await live()).state as Record<string, unknown>;
        const runs = state.runs as Record<string, { ended: boolean }>;
        expect(runs[playerIds[1]].ended).toBe(true);
    });
});

describe("khoi-dong — phase 2 (typed, shared 60 s)", () => {
    it("the MC opens phase 2", async () => {
        const res = await act({ kind: "khoi-dong.beginPhase2" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.stage).toBe("phase2");
        expect(res.json().state.phase2.questionIds).toEqual(phase2Ids);
        expect(res.json().state.phase2OpenedAt).not.toBeNull();
    });

    it("a seated player types a correct answer, worth 10", async () => {
        const res = await answer(playerCookies[0], phase2Ids[0], "ha noi");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ correct: true, points: 10 });
    });

    it("a player cannot answer the same question twice", async () => {
        const res = await answer(playerCookies[0], phase2Ids[0], "Hà Nội");
        expect(res.statusCode).toBe(409);
    });

    it("the MC closes phase 2; further answers are refused", async () => {
        expect((await act({ kind: "khoi-dong.closePhase2" })).statusCode).toBe(200);
        const res = await answer(playerCookies[1], phase2Ids[1], "Hà Nội");
        expect(res.statusCode).toBe(409);
    });

    it("the MC ends the round", async () => {
        const res = await act({ kind: "khoi-dong.endRound" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.ended).toBe(true);
    });

    it("advancing past the last round returns 409 NO_NEXT_ROUND", async () => {
        const res = await act({ kind: "round.advance" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_NEXT_ROUND");
    });
});

describe("khoi-dong — match end", () => {
    it("finishing the match folds both phases into the result", async () => {
        const res = await app.inject({
            method: "PATCH", url: statusUrl(), headers: auth(ownerCookie),
            payload: { status: "FINISHED" }
        });
        expect(res.statusCode).toBe(200);

        const [row] = await db.select().from(matchResults).where(eq(matchResults.matchId, matchId));
        const p0 = row.results.find((r) => r.userId === playerIds[0])!;
        const p1 = row.results.find((r) => r.userId === playerIds[1])!;
        // player 0: 6 oral (60) + 1 typed (10) = 70; player 1 timed out phase 1 = 0
        expect(p0).toMatchObject({ totalScore: 70, rank: 1 });
        expect(p0.roundScores).toEqual({ "khoi-dong": 70 });
        expect(p1).toMatchObject({ totalScore: 0, rank: 2 });
    });
});
