import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { auditEvents, matchLive, matchResults, matches, scoreAdjustments, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// score.adjust — the controller's match-level score correction:
//   version-guarded like every action, written as a score_adjustments row in
//   the SAME transaction as the version bump (fact → ledger), audited, folded
//   into the live scoreboard (scoreTable) and frozen into the results at FINISH.

let app: FastifyInstance;
let ownerCookie: string;
let ownerId: string;
let playerA: string;
let playerB: string;
let tournamentId: string;
let matchId: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const adjustUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live/actions`;
const liveUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/live`;
const statusUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/status`;

const adjust = (body: unknown, expectedVersion: number) =>
    app.inject({ method: "POST", url: adjustUrl(), headers: auth(ownerCookie), payload: { expectedVersion, action: body } });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "sa-owner", displayName: "SA Owner", tokenVersion: 0
    }).returning();
    ownerId = owner.id;
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const playerRows = await db.insert(users).values([
        { role: "PLAYER", email: "sa1@example.com", displayName: "SA One", tokenVersion: 0 },
        { role: "PLAYER", email: "sa2@example.com", displayName: "SA Two", tokenVersion: 0 }
    ]).returning();
    playerA = playerRows[0].id;
    playerB = playerRows[1].id;

    const [tournament] = await db.insert(tournaments).values({
        ownerId: owner.id, visibility: "PUBLIC", slug: "score-adjust-tournament",
        name: "Score Adjust Cup",
        rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();
    tournamentId = tournament.id;

    const [match] = await db.insert(matches).values({
        tournamentId, stageId: "s1", scheduledAt: new Date(), label: "Adjust Match", status: "LIVE",
        players: [
            { kind: "user", userId: playerA, seed: 1 },
            { kind: "user", userId: playerB, seed: 2 }
        ],
        roundConfigs: {
            "khoi-dong": { allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: [] }
        },
        questions: []
    }).returning();
    matchId = match.id;

    await db.insert(matchLive).values({ matchId, version: 0, roundId: "khoi-dong", state: {} });
});

afterAll(async () => {
    await app.close();
});

describe("score.adjust — the version-guarded ledger", () => {
    it("bumps the version, writes the row and audits the correction", async () => {
        const res = await adjust(
            { kind: "score.adjust", userId: playerA, delta: 10, reason: "trả lời miệng · +10" },
            0
        );
        expect(res.statusCode).toBe(200);
        expect(res.json().version).toBe(1);

        const rows = await db.select().from(scoreAdjustments).where(eq(scoreAdjustments.matchId, matchId));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ userId: playerA, delta: 10, reason: "trả lời miệng · +10", createdBy: ownerId });

        const audits = await db.select().from(auditEvents).where(eq(auditEvents.action, "score_adjusted"));
        expect(audits.some((a) => a.matchId === matchId)).toBe(true);
    });

    it("the live scoreboard folds the ledger: match total = answers + adjustments", async () => {
        const res = await adjust(
            { kind: "score.adjust", userId: playerA, delta: -3, reason: "trừ điểm sai" },
            1
        );
        expect(res.statusCode).toBe(200);
        expect(res.json().version).toBe(2);

        const live = await app.inject({ method: "GET", url: liveUrl(), headers: auth(ownerCookie) });
        expect(live.statusCode).toBe(200);
        const table = live.json().projection.table as Array<{ id: string; points: number }>;
        expect(table.find((r) => r.id === playerA)?.points).toBe(7);   // +10 −3, no answers yet
        expect(table.find((r) => r.id === playerB)?.points).toBe(0);
    });

    it("a replayed version is rejected and writes nothing", async () => {
        const res = await adjust(
            { kind: "score.adjust", userId: playerB, delta: 5, reason: "stale" },
            1 // current version is 2
        );
        expect(res.statusCode).toBe(409);
        const rows = await db.select().from(scoreAdjustments).where(eq(scoreAdjustments.matchId, matchId));
        expect(rows).toHaveLength(2);
    });

    it("rejects a zero delta and an unseated player", async () => {
        const zero = await adjust({ kind: "score.adjust", userId: playerB, delta: 0, reason: "noop" }, 2);
        expect(zero.statusCode).toBe(400);

        const ghost = await adjust(
            { kind: "score.adjust", userId: "11111111-1111-4111-8111-111111111111", delta: 5, reason: "ghost" },
            2
        );
        expect(ghost.statusCode).toBe(403);
    });

    it("FINISH freezes the results WITH the adjustments folded in", async () => {
        const res = await app.inject({
            method: "PATCH", url: statusUrl(), headers: auth(ownerCookie),
            payload: { status: "FINISHED" }
        });
        expect(res.statusCode).toBe(200);

        const [frozen] = await db.select().from(matchResults).where(eq(matchResults.matchId, matchId));
        expect(frozen).toBeDefined();
        const totals = Object.fromEntries(
            (frozen!.results as Array<{ userId: string; totalScore: number }>).map((r) => [r.userId, r.totalScore])
        );
        expect(totals[playerA]).toBe(7);  // adjustments reach the frozen results
        expect(totals[playerB]).toBe(0);

        // frozen matches cannot be adjusted (the route requires LIVE anyway)
        const after = await adjust(
            { kind: "score.adjust", userId: playerA, delta: 1, reason: "too late" },
            2
        );
        expect(after.statusCode).toBe(409);
    });
});
