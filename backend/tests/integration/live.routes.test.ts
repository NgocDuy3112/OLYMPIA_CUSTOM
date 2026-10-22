import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { answers, matchEvents, matchLive, matchResults, matchStats, matches, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { MatchQuestion } from "../../src/game/contracts/index.js";

// Runs against the real Postgres in CI. Proves the 409 path, the row lock, facts
// committing with state, and the player submission path.

let app: FastifyInstance;
let ownerCookie: string;
let playerCookies: string[];
let outsiderCookie: string;
let tournamentId: string;
let matchId: string;
let hintIds: string[];
let butPhaIds: string[];
let keywordQuestionId: string;
let playerIds: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const textQuestion = (roundId: string, turnId: string, position: number): MatchQuestion => ({
    _id: randomUUID(), roundId, turnId, position, mode: "text", kind: "TEXT",
    questionText: `Hint ${position}`, media: null, timeLimit: null, points: 0, tag: "THTH",
    payload: { acceptedAnswers: ["Hà Nội"], normalize: { caseSensitive: false, trim: true, stripAccents: true } },
    sourceId: randomUUID()
});

const keywordQuestion = (roundId: string): MatchQuestion => ({
    _id: randomUUID(), roundId, turnId: "keyword", position: 0, mode: "text", kind: "KEYWORD",
    questionText: "The keyword", media: null, timeLimit: null, points: 100, tag: "THTH",
    payload: { code: "DIENBIENPHU", normalize: { caseSensitive: false, trim: true, stripAccents: true } },
    sourceId: randomUUID()
});

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "live-owner", displayName: "Live Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const playerRows = await db.insert(users).values([
        { role: "PLAYER", email: "p1@example.com", displayName: "P1", tokenVersion: 0 },
        { role: "PLAYER", email: "p2@example.com", displayName: "P2", tokenVersion: 0 }
    ]).returning();
    playerIds = playerRows.map((u) => u.id);
    playerCookies = playerRows.map((u) => signToken(app, "GAMEPLAY", { sub: u.id, role: "PLAYER", tokenVersion: 0 }));

    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: "outsider@example.com", displayName: "Outsider", tokenVersion: 0
    }).returning();
    outsiderCookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });

    // The tournament is the unit: it carries the identity the tournament had.
    const tournamentTags = ["THTH"];
    const tournamentOwner = owner.id;
    const tournamentSlug = "live-tournament-tournament";

    const [tournament] = await db.insert(tournaments).values({
        ownerId: tournamentOwner, visibility: "PUBLIC", tags: tournamentTags, slug: tournamentSlug,
        name: "Live Tournament",
        rounds: [
            { id: "giai-ma", name: "Giai Ma", order: 0, chart: "bars" },
            { id: "but-pha", name: "But Pha", order: 1, chart: "bars" }
        ],
        format: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();
    tournamentId = tournament.id;

    const hints = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => textQuestion("giai-ma", "hints", n));
    const keyword = keywordQuestion("giai-ma");
    const butPha = [1, 2, 3, 4].map((n) => textQuestion("but-pha", "but-pha", n));
    hintIds = hints.map((q) => q._id);
    keywordQuestionId = keyword._id;
    butPhaIds = butPha.map((q) => q._id);

    const [match] = await db.insert(matches).values({
        tournamentId, stageId: "s1", scheduledAt: new Date(), label: "Live Match", status: "LIVE",
        players: [
            { kind: "user", userId: playerIds[0], seed: 1 },
            { kind: "user", userId: playerIds[1], seed: 2 }
        ],
        roundConfigs: {
            "giai-ma": { allowedKinds: ["TEXT", "KEYWORD"], scoring: { template: "keyword_derived", initial: 100, dropPerHint: 10, incorrect: 0 }, turns: [] },
            "but-pha": { allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: [] }
        },
        questions: [...hints, keyword, ...butPha]
    }).returning();
    matchId = match.id;

    await db.insert(matchLive).values({
        matchId, version: 0, roundId: "giai-ma",
        state: { stage: "hints", players: [], hintIds: [], picked: [], openHint: null, openHintAt: null }
    });
});

afterAll(async () => {
    await app.close();
});

const actionUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live`;
const answerUrl = () => `/gameplay/matches/${matchId}/live/answers`;
const keywordUrl = () => `/gameplay/matches/${matchId}/live/keyword`;
const statusUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/status`;

async function live(): Promise<{ version: number; roundId: string; state: Record<string, unknown> }> {
    const res = await app.inject({ method: "GET", url: liveUrl(), headers: auth(ownerCookie) });
    return res.json();
}

// Pin the open question's clock `msAgo` into the past, as the real clock would after
// time passes. Keeps but-pha points deterministic instead of timing-dependent.
async function backdateQuestionClock(msAgo: number): Promise<void> {
    const current = await live();
    const state = current.state as Record<string, unknown>;
    await db.update(matchLive)
        .set({ state: { ...state, questionOpenedAt: new Date(Date.now() - msAgo).toISOString() } })
        .where(eq(matchLive.matchId, matchId));
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

describe("live actions — start", () => {
    it("start writes the initial giai-ma state", async () => {
        const res = await act({ kind: "giai-ma.start", playerIds, hintIds });
        expect(res.statusCode).toBe(200);
        expect(res.json().state).toMatchObject({ stage: "hints", hintIds, picked: [], openHint: null });
    });
});

describe("live actions — version guard over HTTP", () => {
    it("a stale expected version returns 409 with both versions", async () => {
        const res = await app.inject({
            method: "POST", url: actionUrl(), headers: auth(ownerCookie),
            payload: { expectedVersion: 0, action: { kind: "giai-ma.closeHintWindow" } }
        });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ error: "CONFLICT", expectedVersion: 0 });
    });
});

describe("live actions — concurrency (row lock)", () => {
    it("two concurrent opens of the same hint: exactly one commits", async () => {
        const { version } = await live();
        const open = {
            method: "POST" as const, url: actionUrl(), headers: auth(ownerCookie),
            payload: { expectedVersion: version, action: { kind: "giai-ma.openHint", hintId: hintIds[0] } }
        };
        const [a, b] = await Promise.all([app.inject(open), app.inject(open)]);
        expect([a.statusCode, b.statusCode].sort()).toEqual([200, 409]);
        expect((await live()).version).toBe(version + 1);
    });
});

describe("live actions — validation", () => {
    it("an unknown action kind is rejected with 400, before dispatch", async () => {
        expect((await act({ kind: "not-a-real-action" })).statusCode).toBe(400);
    });

    it("a hint that is not a question of this match is rejected with 400", async () => {
        expect((await act({ kind: "giai-ma.openHint", hintId: randomUUID() })).statusCode).toBe(400);
    });
});

describe("player submissions", () => {
    it("a seated player cannot submit when no window is open for the question", async () => {
        const res = await answer(playerCookies[0], hintIds[3], "Hà Nội");
        expect(res.statusCode).toBe(409);
    });

    it("a player who is not seated cannot submit", async () => {
        const res = await answer(outsiderCookie, hintIds[0], "Hà Nội");
        expect(res.statusCode).toBe(403);
    });

    it("a seated player submits a correct answer while the window is open", async () => {
        const res = await answer(playerCookies[0], hintIds[0], "ha noi");   // accents/case ignored
        expect(res.statusCode).toBe(200);
        expect(res.json().correct).toBe(true);
    });

    it("a player may revise while the window is open: the last answer wins", async () => {
        const first = await answer(playerCookies[1], hintIds[0], "Hà Nội");
        expect(first.statusCode).toBe(200);
        expect(first.json().correct).toBe(true);

        const second = await answer(playerCookies[1], hintIds[0], "Hải Phòng");
        expect(second.statusCode).toBe(200);
        expect(second.json().correct).toBe(false);

        const rows = await db.select().from(answers).where(and(
            eq(answers.matchId, matchId),
            eq(answers.questionId, hintIds[0]),
            eq(answers.userId, playerIds[1])
        ));
        expect(rows).toHaveLength(1);                    // revised in place, not appended
        expect(rows[0]).toMatchObject({ verdict: "INCORRECT", value: { text: "Hải Phòng" } });
    });

    it("a malformed answer value is rejected with 400", async () => {
        const res = await app.inject({
            method: "POST", url: answerUrl(), headers: asPlayer(playerCookies[0]),
            payload: { questionId: hintIds[0], value: { nonsense: true } }
        });
        expect(res.statusCode).toBe(400);
    });
});

describe("resolve — the MC closes the window using submitted answers", () => {
    it("resolveHint reveals the hint to the players who answered correctly", async () => {
        const res = await act({ kind: "giai-ma.resolveHint" });
        expect(res.statusCode).toBe(200);
        const state = res.json().state;
        expect(state.openHint).toBeNull();
        expect(state.picked).toEqual([hintIds[0]]);
        expect(state.players.find((p: { id: string }) => p.id === playerIds[0]).hintsRevealed).toBe(1);
        expect(state.players.find((p: { id: string }) => p.id === playerIds[1]).hintsRevealed).toBe(0);
    });

    it("resolving with no open window returns 409 NO_OPEN_HINT", async () => {
        const res = await act({ kind: "giai-ma.resolveHint" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_OPEN_HINT");
    });

    it("the answers ledger holds both submissions with auto_matched set", async () => {
        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.questionId, hintIds[0])));
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.autoMatched && r.judged)).toBe(true);
        expect(rows.filter((r) => r.verdict === "CORRECT")).toHaveLength(1);
    });
});

describe("facts — committed with the state", () => {
    it("opening a hint writes a PICK event", async () => {
        const res = await act({ kind: "giai-ma.openHint", hintId: hintIds[1] });
        expect(res.statusCode).toBe(200);
        const events = await db.select().from(matchEvents)
            .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.kind, "PICK")));
        const forHint = events.filter((e) => e.questionId === hintIds[1]);
        expect(forHint).toHaveLength(1);
        expect(forHint[0].payload).toMatchObject({ kind: "PICK", pickOrder: 2 });
    });

    it("the MC closes the window", async () => {
        expect((await act({ kind: "giai-ma.closeHintWindow" })).statusCode).toBe(200);
    });

    it("an MC keyword submission writes an answers row with the locked value", async () => {
        // player 0 has one revealed hint, so their keyword is 90.
        const res = await act({
            kind: "giai-ma.submitKeyword",
            playerId: playerIds[0], questionId: keywordQuestionId, correct: true, text: "DIENBIENPHU"
        });
        expect(res.statusCode).toBe(200);
        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.userId, playerIds[0])));
        const keywordRow = rows.find((r) => r.questionId === keywordQuestionId);
        expect(keywordRow).toMatchObject({ verdict: "CORRECT", pointsAwarded: 90, autoMatched: false });
    });
});

describe("player submission guards", () => {
    it("the MC opens a fresh window", async () => {
        expect((await act({ kind: "giai-ma.openHint", hintId: hintIds[2] })).statusCode).toBe(200);
    });

    it("a player who already submitted their keyword may not answer a hint", async () => {
        const res = await answer(playerCookies[0], hintIds[2], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().message).toContain("no longer answer");
    });

    it("another active player may still answer in the same window", async () => {
        const res = await answer(playerCookies[1], hintIds[2], "Hà Nội");
        expect(res.statusCode).toBe(200);
        expect(res.json().correct).toBe(true);
    });

    it("an answer after the window's 15 seconds is rejected", async () => {
        const current = await live();
        await db.update(matchLive)
            .set({ state: { ...current.state, openHintAt: new Date(Date.now() - 20_000).toISOString() } })
            .where(eq(matchLive.matchId, matchId));

        const res = await answer(playerCookies[1], hintIds[2], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().message).toContain("window has closed");
    });
});

describe("round progression", () => {
    it("advancing before the round has ended returns 409 ROUND_NOT_ENDED", async () => {
        // player 1 is still active, so the round has not ended.
        const res = await act({ kind: "round.advance" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("ROUND_NOT_ENDED");
    });

    it("resolving the expired window reveals the hint to the correct answerer", async () => {
        const res = await act({ kind: "giai-ma.resolveHint" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.players.find((p: { id: string }) => p.id === playerIds[1]).hintsRevealed).toBe(1);
    });

    it("a player submits their keyword and is locked with the value they earned", async () => {
        // player 1 now has one revealed hint, so their keyword is 90.
        const res = await app.inject({
            method: "POST", url: keywordUrl(), headers: asPlayer(playerCookies[1]),
            payload: { questionId: keywordQuestionId, value: { text: "dienbienphu" } }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().correct).toBe(true);
        expect(res.json().points).toBe(90);
    });

    it("submitting a keyword twice is rejected", async () => {
        const res = await app.inject({
            method: "POST", url: keywordUrl(), headers: asPlayer(playerCookies[1]),
            payload: { questionId: keywordQuestionId, value: { text: "DIENBIENPHU" } }
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("ALREADY_SUBMITTED");
    });

    it("the player's keyword answer is stored with auto_matched true", async () => {
        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.userId, playerIds[1])));
        expect(rows.find((r) => r.questionId === keywordQuestionId)).toMatchObject({
            verdict: "CORRECT", pointsAwarded: 90, autoMatched: true
        });
    });

    it("with both players locked the round is over; advance moves to the next round", async () => {
        expect((await act({ kind: "giai-ma.endRound" })).statusCode).toBe(200);
        const advanced = await act({ kind: "round.advance" });
        expect(advanced.statusCode).toBe(200);
        expect(advanced.json().roundId).toBe("but-pha");
        expect(advanced.json().state).toEqual({});
    });

    it("a giai-ma action on another round is rejected with 409 WRONG_ROUND", async () => {
        const res = await act({ kind: "giai-ma.endRound" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("WRONG_ROUND");
    });

    it("a player cannot answer before the round has started", async () => {
        const res = await answer(playerCookies[0], hintIds[3], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().message).toContain("has not started");
    });

    it("the keyword route is refused once the round has moved on", async () => {
        const res = await app.inject({
            method: "POST", url: keywordUrl(), headers: asPlayer(playerCookies[0]),
            payload: { questionId: keywordQuestionId, value: { text: "x" } }
        });
        expect(res.statusCode).toBe(409);
    });
});

describe("live actions — authorisation", () => {
    it("a PLAYER cannot drive a live match", async () => {
        const portalPlayer = signToken(app, "PORTAL", { sub: playerIds[0], role: "PLAYER", tokenVersion: 0 });
        const res = await app.inject({
            method: "POST", url: actionUrl(), headers: auth(portalPlayer),
            payload: { expectedVersion: 0, action: { kind: "giai-ma.endRound" } }
        });
        expect(res.statusCode).toBe(403);
    });

    it("an anonymous caller cannot submit an answer", async () => {
        const res = await app.inject({
            method: "POST", url: answerUrl(), payload: { questionId: hintIds[0], value: { text: "Hà Nội" } }
        });
        expect(res.statusCode).toBe(401);
    });
});

describe("but-pha round — draft, then finalize", () => {
    it("the MC starts but-pha with the match's questions in position order", async () => {
        const res = await act({ kind: "but-pha.start" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.questionIds).toEqual(butPhaIds);
    });

    it("a player cannot answer before the question's clock starts", async () => {
        const res = await answer(playerCookies[0], butPhaIds[0], "Hà Nội");
        expect(res.statusCode).toBe(409);
        expect(res.json().message).toContain("clock has not started");
    });

    it("the MC opens the first question", async () => {
        const res = await act({ kind: "but-pha.openQuestion" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.questionOpenedAt).not.toBeNull();
    });

    it("a typed answer becomes a draft carrying its submission time", async () => {
        await backdateQuestionClock(3_000);
        const res = await answer(playerCookies[0], butPhaIds[0], "Hà Nội");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ drafted: true, suggested: "CORRECT" });

        const [row] = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.questionId, butPhaIds[0]), eq(answers.userId, playerIds[0])));
        expect(row.judged).toBe(false);
        expect(row.answeredMs).toBeGreaterThanOrEqual(3_000);      // the round's clock source
        expect(row.pointsAwarded ?? 0).toBe(0);                    // nothing scores yet
    });

    it("a second player drafts in the same question", async () => {
        await backdateQuestionClock(7_000);
        const res = await answer(playerCookies[1], butPhaIds[0], "ha noi");
        expect(res.statusCode).toBe(200);
    });

    it("but-pha allows only one attempt per question", async () => {
        const res = await answer(playerCookies[0], butPhaIds[0], "Hải Phòng");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("ALREADY_ANSWERED");
    });

    it("the controller finalizes, and the points follow submission order", async () => {
        const res = await act({
            kind: "but-pha.finalize", questionId: butPhaIds[0],
            verdicts: [{ playerId: playerIds[1], correct: true }, { playerId: playerIds[0], correct: true }]
        });
        expect(res.statusCode).toBe(200);

        // player 0 submitted first (3 s, base 15 x4 = 60); player 1 second (7 s, base 10 x3 = 30)
        const points = res.json().state.points[butPhaIds[0]];
        expect(points[playerIds[0]]).toBe(60);
        expect(points[playerIds[1]]).toBe(30);

        const rows = await db.select().from(answers)
            .where(and(eq(answers.matchId, matchId), eq(answers.questionId, butPhaIds[0])));
        expect(rows.every((r) => r.judged)).toBe(true);
        expect(rows.find((r) => r.userId === playerIds[0])).toMatchObject({ verdict: "CORRECT", pointsAwarded: 60 });
    });

    it("the MC closes the question once every answer is judged", async () => {
        const res = await act({ kind: "but-pha.closeQuestion" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.cursor).toBe(1);
        expect(res.json().state.questionOpenedAt).toBeNull();
    });

    it("closing a question with an unjudged answer is blocked", async () => {
        await act({ kind: "but-pha.openQuestion" });
        await backdateQuestionClock(20_000);
        expect((await answer(playerCookies[1], butPhaIds[1], "Hà Nội")).statusCode).toBe(200);

        const res = await act({ kind: "but-pha.closeQuestion" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("UNJUDGED_ANSWERS");
    });

    it("the controller may overwrite a correct draft with an incorrect verdict", async () => {
        const res = await act({
            kind: "but-pha.finalize", questionId: butPhaIds[1],
            verdicts: [{ playerId: playerIds[1], correct: false }]
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.points[butPhaIds[1]][playerIds[1]]).toBe(0);
        expect((await act({ kind: "but-pha.closeQuestion" })).statusCode).toBe(200);
    });

    it("the MC ends the round", async () => {
        const res = await act({ kind: "but-pha.endRound" });
        expect(res.statusCode).toBe(200);
        expect(res.json().state.ended).toBe(true);
    });

    it("advancing past the last round returns 409 NO_NEXT_ROUND", async () => {
        const res = await act({ kind: "round.advance" });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NO_NEXT_ROUND");
    });
});

describe("match end — the results are frozen once", () => {
    it("finishing the match returns 200 and writes the competitor results", async () => {
        const res = await app.inject({
            method: "PATCH", url: statusUrl(), headers: auth(ownerCookie),
            payload: { status: "FINISHED" }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().status).toBe("FINISHED");

        const [row] = await db.select().from(matchResults).where(eq(matchResults.matchId, matchId));
        expect(row.results).toHaveLength(2);

        // Both solved the giai-ma keyword from one revealed hint (90 each). In but-pha,
        // player 0 was first correct (60) and player 1 second (30).
        const p0 = row.results.find((r) => r.userId === playerIds[0])!;
        const p1 = row.results.find((r) => r.userId === playerIds[1])!;
        expect(p0).toMatchObject({ kind: "user", totalScore: 150, rank: 1 });
        expect(p0.roundScores).toEqual({ "giai-ma": 90, "but-pha": 60 });
        expect(p1).toMatchObject({ kind: "user", totalScore: 120, rank: 2 });
        expect(p1.roundScores).toEqual({ "giai-ma": 90, "but-pha": 30 });
    });

    it("the per-question analytics grain is written for the round", async () => {
        const rows = await db.select().from(matchStats).where(eq(matchStats.matchId, matchId));
        // giai-ma: hint 0 (both) + hint 2 (one) + keyword (player) + keyword (MC) = 5
        // but-pha: two answers on question 1, one on question 2 = 3
        expect(rows).toHaveLength(8);
        expect(rows.filter((r) => r.roundId === "but-pha")).toHaveLength(3);
        expect(rows.every((r) => r.tournamentId === tournamentId)).toBe(true);
    });

    it("finishing again is a no-op and does not duplicate the frozen rows", async () => {
        const res = await app.inject({
            method: "PATCH", url: statusUrl(), headers: auth(ownerCookie),
            payload: { status: "FINISHED" }
        });
        expect(res.statusCode).toBe(200);
        expect((await db.select().from(matchResults).where(eq(matchResults.matchId, matchId)))).toHaveLength(1);
        expect((await db.select().from(matchStats).where(eq(matchStats.matchId, matchId)))).toHaveLength(8);
    });
});
