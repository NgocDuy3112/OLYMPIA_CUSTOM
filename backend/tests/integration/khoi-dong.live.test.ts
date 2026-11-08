import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { answers, matchLive, matchResults, matches, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";


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
        { role: "PLAYER", username: "kd1", email: "kd1@example.com", displayName: "KD1", tokenVersion: 0 },
        { role: "PLAYER", username: "kd2", email: "kd2@example.com", displayName: "KD2", tokenVersion: 0 }
    ]).returning();
    playerIds = playerRows.map((u) => u.id);
    playerCookies = playerRows.map((u) => signToken(app, "GAMEPLAY", { sub: u.id, role: "PLAYER", tokenVersion: 0 }));

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
    const p2 = Array.from({ length: 6 }, (_, i) => question("phase2", i + 1));
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
                    { id: "phase2", mode: "text", delivery: "batch", timeLimitSeconds: 10 }
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
    it("the console starts the round; every seated player gets a run", async () => {
        const res = await act({ kind: "khoi-dong.start" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.stage).toBe("phase1");
        expect(Object.keys(res.json().state.runs)).toEqual(playerIds);
        expect(res.json().state.runs[playerIds[0]].questionIds).toEqual(phase1Ids);
    });

    it("a player cannot submit a typed answer — phase 1 is oral", async () => {
        const res = await answer(playerCookies[0], phase1Ids[0], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_WINDOW");
    });

    it("the console records six correct answers for player 0, each worth 10", async () => {
        for (let i = 0; i < 6; i++) {
            const res = await act({ kind: "khoi-dong.recordOral", correct: true, spentS: 2 });
            expect(res.statusCode).toBe(200);
        }
        const state = (await live()).state as Record<string, unknown>;
        expect(state.activeIndex).toBe(1);                       
        const p0 = (state.runs as Record<string, { results: Record<string, { points: number }> }>)[playerIds[0]];
        expect(Object.values(p0.results).every((r) => r.points === 10)).toBe(true);

        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.userId, playerIds[0])));
        expect(rows).toHaveLength(6);
        expect(rows.every((r) => r.pointsAwarded === 10 && r.autoMatched === false)).toBe(true);
        expect(rows.every((r) => JSON.stringify(r.value) === JSON.stringify({ oral: true }))).toBe(true);
    });

    it("the console times out player 1's run; phase 1 is complete", async () => {
        const res = await act({ kind: "khoi-dong.timeOutRun" });
        expect(res.statusCode).toBe(200);
        const state = (await live()).state as Record<string, unknown>;
        const runs = state.runs as Record<string, { ended: boolean }>;
        expect(runs[playerIds[1]].ended).toBe(true);
    });
});

describe("khoi-dong — phase 2: the timed batch", () => {
    it("the console opens phase 2 with six questions, and nothing runs yet", async () => {
        const res = await act({ kind: "khoi-dong.beginPhase2" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.stage).toBe("phase2");
        expect(res.json().state.phase2.questionIds).toEqual(phase2Ids);
        expect(res.json().state.phase2.questionIds).toHaveLength(6);
        expect(res.json().state.phase2.openedAt).toBeNull();
    });

    it("a typed answer before Bấm giờ is refused", async () => {
        const res = await answer(playerCookies[0], phase2Ids[0], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_WINDOW");
    });

    it("Bấm giờ opens the window: the question carries a 10 s deadline and both players may type", async () => {
        expect((await act({ kind: "khoi-dong.startWindow" })).statusCode).toBe(200);

        const mine = await app.inject({
            method: "GET", url: `/gameplay/matches/${matchId}/live`, headers: asPlayer(playerCookies[0])
        });
        const view = mine.json();
        expect(view.open.map((o: { questionId: string }) => o.questionId)).toEqual([phase2Ids[0]]);
        expect(Date.parse(view.open[0].deadlineAt) - Date.parse(view.open[0].deadlineAt.slice(0, 19) + ".000Z")).toBeGreaterThanOrEqual(0);
        expect(view.me.windowOpen).toBe(true);
        expect(view.me.questionCount).toBe(6);

        expect((await answer(playerCookies[0], phase2Ids[0], "Hà Nội")).statusCode).toBe(200);
        expect((await answer(playerCookies[1], phase2Ids[0], "Sài Gòn")).statusCode).toBe(200);
    });

    it("the console marks each card: a wrong one pays nothing, a right one pays 10", async () => {
        const wrong = await act({ kind: "khoi-dong.judge", playerId: playerIds[1], correct: false });
        expect(wrong.statusCode).toBe(200);
        expect(wrong.json().state.phase2.results[phase2Ids[0]][playerIds[1]]).toBe(0);

        const right = await act({ kind: "khoi-dong.judge", playerId: playerIds[0], correct: true });
        expect(right.statusCode).toBe(200);
        expect(right.json().state.phase2.results[phase2Ids[0]][playerIds[0]]).toBe(10);

        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.questionId, phase2Ids[0])));
        expect(rows).toHaveLength(2);
        expect(rows.find((r) => r.userId === playerIds[0])?.verdict).toBe("CORRECT");
        expect(rows.find((r) => r.userId === playerIds[0])?.pointsAwarded).toBe(10);
        expect(rows.find((r) => r.userId === playerIds[1])?.verdict).toBe("INCORRECT");
    });

    it("marking a player who submitted nothing is refused", async () => {
        const [outsider] = await db.insert(users).values({
            role: "PLAYER", username: "kd-judge-outsider", email: "kd-judge-outsider@example.com", displayName: "Out", tokenVersion: 0
        }).returning();
        const res = await act({ kind: "khoi-dong.judge", playerId: outsider.id, correct: true });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_ANSWER");
    });

    it("the strip waits for every card to be judged, then moves on", async () => {
        const advanced = await act({ kind: "khoi-dong.nextQuestion" });
        expect(advanced.statusCode).toBe(200);
        expect(advanced.json().state.phase2.index).toBe(1);
        expect(advanced.json().state.phase2.openedAt).toBeNull();

        const early = await answer(playerCookies[0], phase2Ids[1], "Hà Nội");
        expect(early.statusCode).toBe(409);
        expect(early.json().error).toBe("NO_WINDOW");

        expect((await act({ kind: "khoi-dong.startWindow" })).statusCode).toBe(200);
        expect((await answer(playerCookies[0], phase2Ids[1], "Hà Nội")).statusCode).toBe(200);
        const blocked = await act({ kind: "khoi-dong.nextQuestion" });
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json().error).toBe("UNJUDGED_ANSWERS");

        expect((await act({ kind: "khoi-dong.judge", playerId: playerIds[0], correct: true })).statusCode).toBe(200);
        const moved = await act({ kind: "khoi-dong.nextQuestion" });
        expect(moved.statusCode).toBe(200);
        expect(moved.json().state.phase2.index).toBe(2);
    });

    it("a player who is not seated cannot answer", async () => {
        const [outsider] = await db.insert(users).values({
            role: "PLAYER", username: "kd-answer-outsider", email: "kd-answer-outsider@example.com", displayName: "Out", tokenVersion: 0
        }).returning();
        const cookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });
        expect((await act({ kind: "khoi-dong.startWindow" })).statusCode).toBe(200);
        const res = await answer(cookie, phase2Ids[1], "Hà Nội");
        expect(res.statusCode).toBe(403);
    });

    it("the console ends the round", async () => {
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
        expect(p0).toMatchObject({ totalScore: 80, rank: 1 });
        expect(p0.roundScores).toEqual({ "khoi-dong": 80 });
        expect(p1).toMatchObject({ totalScore: 0, rank: 2 });
    });
});
