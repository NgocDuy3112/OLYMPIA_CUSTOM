import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { answers, matchLive, matchResults, matches, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";

// khoi-dong end to end: phase 1 oral (MC-recorded, 45 s per player), phase 2 typed
// (all players, one shared 60 s).

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let tournamentId: string;
let matchId: string;
let playerIds: string[];
let phase1Ids: string[];
let phase2Ids: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const question = (turnId: string, position: number): MatchQuestion => ({
    _id: randomUUID(), roundId: "khoi-dong", turnId, position, mode: turnId === "phase1" ? "oral" : "text",
    kind: "TEXT", questionText: `${turnId} ${position}`, media: null, timeLimit: null, points: 10, 
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

    // The tournament is the unit: it carries the identity the tournament had.
    const tournamentTags = ["THTH"];
    const tournamentOwner = owner.id;
    const tournamentSlug = "kd-tournament-tournament";

    const [tournament] = await db.insert(tournaments).values({
        ownerId: tournamentOwner, visibility: "PUBLIC", slug: tournamentSlug,
        name: "KD Tournament",
        rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: 2 },
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();
    tournamentId = tournament.id;

    const p1 = [1, 2, 3, 4, 5, 6].map((n) => question("phase1", n));
    // Chung stages TWELVE questions; the engine refuses any other count.
    const p2 = Array.from({ length: 12 }, (_, i) => question("phase2", i + 1));
    phase1Ids = p1.map((q) => q._id);
    phase2Ids = p2.map((q) => q._id);

    const [match] = await db.insert(matches).values({
        tournamentId, stageId: "s1", scheduledAt: new Date(), label: "KD Match", status: "LIVE",
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
                    { id: "phase2", mode: "oral", delivery: "sequential", buzzWindowSeconds: 5 }
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

const actionUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live`;
const answerUrl = () => `/gameplay/matches/${matchId}/live/answers`;
const statusUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/status`;
const answersUrl = (questionId: string) =>
    `/portal/tournaments/${tournamentId}/matches/${matchId}/live/answers?questionId=${questionId}`;

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

    it("a player cannot submit a typed answer — chung takes buzzes only", async () => {
        const res = await answer(playerCookies[0], phase1Ids[0], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("BUZZ_ONLY");
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

describe("khoi-dong — phase 2: the buzz race", () => {
    const buzz = (cookie: string) =>
        app.inject({ method: "POST", url: `/gameplay/matches/${matchId}/live/buzz`, headers: asPlayer(cookie) });

    it("the MC opens phase 2 with twelve questions, and nothing runs yet", async () => {
        const res = await act({ kind: "khoi-dong.beginPhase2" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.stage).toBe("phase2");
        expect(res.json().state.phase2.questionIds).toEqual(phase2Ids);
        expect(res.json().state.phase2.questionIds).toHaveLength(12);
        expect(res.json().state.phase2.current).toBeNull();
    });

    it("a buzz before the window opens is refused", async () => {
        const res = await buzz(playerCookies[0]);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOTHING_OPEN");
    });

    it("the fastest buzz wins; the second player is blocked", async () => {
        expect((await act({ kind: "khoi-dong.openBuzz" })).statusCode).toBe(200);

        const first = await buzz(playerCookies[0]);
        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ buzzed: true });

        const second = await buzz(playerCookies[1]);
        expect(second.statusCode).toBe(409);
        expect(second.json().error).toBe("ALREADY_OPEN");
    });

    it("the player view offers the buzz to nobody once the fastest has landed", async () => {
        const mine = await app.inject({
            method: "GET", url: `/gameplay/matches/${matchId}/live`, headers: asPlayer(playerCookies[0])
        });
        const view = mine.json();
        expect(view.open.map((o: { questionId: string }) => o.questionId)).toEqual([phase2Ids[0]]);
        expect(view.me.isAnswerer).toBe(true);
        expect(view.me.canBuzz).toBe(false);
    });

    it("the MC judges it wrong: the answerer is locked out and the re-buzz is armed", async () => {
        const res = await act({ kind: "khoi-dong.judgeBuzz", correct: false });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.phase2.current.excluded).toEqual([playerIds[0]]);
        expect(res.json().state.phase2.current.attempt).toBe(2);

        // A powers the second window; the wrong answerer is refused, the other lands it.
        expect((await act({ kind: "khoi-dong.openBuzz" })).statusCode).toBe(200);
        const barred = await buzz(playerCookies[0]);
        expect(barred.statusCode).toBe(409);
        expect(barred.json().error).toBe("NOT_YOUR_TURN");

        expect((await buzz(playerCookies[1])).statusCode).toBe(200);
    });

    it("a correct second-chance answer is worth 5", async () => {
        const res = await act({ kind: "khoi-dong.judgeBuzz", correct: true });
        expect(res.statusCode).toBe(200);

        // The phase keeps its own ledger — stats are written at match end.
        const awards = res.json().state.phase2.awards as Record<string, number>;
        expect(awards[playerIds[1]]).toBe(5);
        expect(awards[playerIds[0]] ?? 0).toBe(0);
        expect(res.json().state.phase2.index).toBe(1);
    });

    it("nobody buzzing: the MC moves on and the question costs nothing", async () => {
        expect((await act({ kind: "khoi-dong.openBuzz" })).statusCode).toBe(200);
        const res = await act({ kind: "khoi-dong.nextQuestion" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.phase2.index).toBe(2);
    });

    it("a player who is not seated cannot buzz", async () => {
        const [outsider] = await db.insert(users).values({
            role: "PLAYER", email: "kd-buzz-outsider@example.com", displayName: "Out", tokenVersion: 0
        }).returning();
        const cookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });
        const res = await buzz(cookie);
        expect(res.statusCode).toBe(403);
    });

    it("the MC closes phase 2; further buzzes are refused", async () => {
        expect((await act({ kind: "khoi-dong.closePhase2" })).statusCode).toBe(200);
        const res = await buzz(playerCookies[0]);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("PHASE_ENDED");
    });

    it("the MC ends the round", async () => {
        const res = await act({ kind: "khoi-dong.endRound" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.ended).toBe(true);
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
        // player 0: 6 oral = 60, and lost the buzz (wrong first answer).
        // player 1: timed out phase 1, then took the second-chance buzz for 5.
        expect(p0).toMatchObject({ totalScore: 60, rank: 1 });
        expect(p0.roundScores).toEqual({ "khoi-dong": 60 });
        expect(p1).toMatchObject({ totalScore: 5, rank: 2 });
    });
});
