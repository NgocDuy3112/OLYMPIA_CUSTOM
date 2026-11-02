import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { RoundConfig } from "../../src/game/contracts/index.js";

// The AOC group stage, end to end: the DRAW places contestants in Nhóm A / Nhóm B,
// and the tables are DERIVED from those groups plus the frozen results of the
// phase matches. Nothing is stored, so the table can never drift.

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;
let playerIds: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const url = (suffix: string) => `/portal/tournaments/${tournamentId}${suffix}`;

const roundRules: Record<string, RoundConfig> = {
    "ve-dich": {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 2 }]
    }
};

// AOC: the two group phases ARE stages (§3.3), and a match holds 3 or 4 seats.
const STAGES = [
    { id: "phase-1", title: "Vòng bảng · Phase 1" },
    { id: "phase-2", title: "Vòng bảng · Phase 2" },
    { id: "playoff-1", title: "Bán kết" }
];

const drawPlayer = (userId: string, group: "A" | "B" | null) =>
    app.inject({
        method: "PATCH",
        url: url(`/players/${userId}/group`),
        headers: auth(ownerCookie),
        payload: { group }
    });

const groups = () => app.inject({ method: "GET", url: url("/groups"), headers: auth(ownerCookie) });

const createMatch = (payload: Record<string, unknown>) =>
    app.inject({
        method: "POST",
        url: url("/matches"),
        headers: auth(ownerCookie),
        payload: {
            label: "M01",
            scheduledAt: "2026-03-01T10:00:00Z",
            ...payload
        }
    });

const closeMatch = async (stageId: string, totals: Array<{ userId: string; score: number }>) => {
    const created = await createMatch({
        stageId,
        players: totals.map((t, i) => ({ kind: "user", userId: t.userId, seed: i + 1 }))
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    // Writing the results IS what freezes them (same path the console takes);
    // the match's status is not what the group table reads.
    const scored = await app.inject({
        method: "POST",
        url: url(`/matches/${id}/results`),
        headers: auth(ownerCookie),
        payload: { totals }
    });
    expect(scored.statusCode).toBe(200);
};

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "grp-owner", displayName: "GRP Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 5 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `grp${i}@example.com`,
            displayName: `GRP${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);

    const [tournament] = await db.insert(tournaments).values({
        ownerId: owner.id,
        visibility: "PUBLIC",
        slug: "grp-tournament",
        name: "GRP Tournament",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: { competitorsPerMatch: 4, allowedCompetitorCounts: [3, 4] },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: STAGES,
        roundRules
    }).returning();
    tournamentId = tournament.id;

    // Everyone enrolled; nobody drawn yet — that is the frame's starting state.
    await db.insert(tournamentPlayers).values(playerIds.map((userId) => ({ tournamentId, userId })));
});

afterAll(async () => {
    await app.close();
});

describe("the draw", () => {
    it("starts with every enrolled contestant unassigned", async () => {
        const res = await groups();
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.groups.map((g: { id: string }) => g.id)).toEqual(["A", "B"]);
        expect(body.groups.every((g: { rows: unknown[] }) => g.rows.length === 0)).toBe(true);
        expect(body.unassigned).toHaveLength(5);
    });

    it("places a contestant in Nhóm A, and clearing puts them back in the undrawn pool", async () => {
        const placed = await drawPlayer(playerIds[0], "A");
        expect(placed.statusCode).toBe(200);
        expect(placed.json()).toEqual({ userId: playerIds[0], group: "A" });

        let body = (await groups()).json();
        expect(body.groups[0].rows.map((r: { displayName: string }) => r.displayName)).toEqual(["GRP0"]);
        expect(body.unassigned).toHaveLength(4);

        await drawPlayer(playerIds[0], null);
        body = (await groups()).json();
        expect(body.groups[0].rows).toHaveLength(0);
        expect(body.unassigned).toHaveLength(5);
    });

    it("404s for a player who is not enrolled — the draw is the roster's, not anyone's", async () => {
        const [stranger] = await db.insert(users).values({
            role: "PLAYER", email: "grp-stranger@example.com", displayName: "Stranger", tokenVersion: 0
        }).returning();

        const res = await drawPlayer(stranger.id, "B");
        expect(res.statusCode).toBe(404);
        expect(res.json().code).toBe("NOT_ENROLLED");

        // …and the roster is untouched.
        const rows = await db.select().from(tournamentPlayers)
            .where(eq(tournamentPlayers.userId, stranger.id));
        expect(rows).toHaveLength(0);
    });

    it("rejects a group that is not A or B", async () => {
        const res = await app.inject({
            method: "PATCH",
            url: url(`/players/${playerIds[1]}/group`),
            headers: auth(ownerCookie),
            payload: { group: "C" }
        });
        expect(res.statusCode).toBe(400);
    });
});

describe("the tables", () => {
    it("banks the placement points to the contestant's group", async () => {
        // Two per group, and one left undrawn.
        await drawPlayer(playerIds[0], "A");
        await drawPlayer(playerIds[1], "A");
        await drawPlayer(playerIds[2], "B");
        await drawPlayer(playerIds[3], "B");

        // Phase 1, 4 seats: 1st banks 3, 2nd banks 1 — so A takes 4.
        await closeMatch("phase-1", [
            { userId: playerIds[0], score: 40 },
            { userId: playerIds[1], score: 30 },
            { userId: playerIds[2], score: 20 },
            { userId: playerIds[3], score: 10 }
        ]);

        const body = (await groups()).json();
        const a = body.groups.find((g: { id: string }) => g.id === "A");
        const b = body.groups.find((g: { id: string }) => g.id === "B");

        expect(a.teamPoints).toBe(4);        // 3 + 1
        expect(b.teamPoints).toBe(0);
        expect(a.rows.map((r: { bankedPoints: number }) => r.bankedPoints)).toEqual([3, 1]);
        expect(a.rows[0].matchesPlayed).toBe(1);
        expect(body.unassigned.map((r: { userId: string }) => r.userId)).toEqual([playerIds[4]]);
        // the wildcard table is the pooled average, best first
        expect(body.wildcard.map((r: { displayName: string }) => r.displayName)).toEqual(["GRP0", "GRP1", "GRP2", "GRP3"]);
    });

    it("counts Phase 1 negatives as 0 in the averages but keeps the raw result", async () => {
        // A 3-seat Phase 2 match: 1st banks 1 (the 2-point row is the 4-seat one),
        // and GRP1 finishes negative.
        await closeMatch("phase-2", [
            { userId: playerIds[2], score: 25 },
            { userId: playerIds[1], score: -30 },
            { userId: playerIds[3], score: 5 }
        ]);

        const body = (await groups()).json();
        const a = body.groups.find((g: { id: string }) => g.id === "A");
        const b = body.groups.find((g: { id: string }) => g.id === "B");

        expect(b.teamPoints).toBe(1);        // GRP2 won a 3-seat Phase 2 match
        const grp1 = a.rows.find((r: { displayName: string }) => r.displayName === "GRP1");
        expect(grp1.matchesPlayed).toBe(2);
        expect(grp1.averages.phase2).toBe(-30);   // Phase 2 counts raw
        expect(grp1.averages.all).toBe(0);        // (30 + -30) / 2
    });

    it("accrues nothing from a bracket stage — only the two group phases pay", async () => {
        const before = (await groups()).json();

        await closeMatch("playoff-1", [
            { userId: playerIds[0], score: 99 },
            { userId: playerIds[2], score: 1 },
            { userId: playerIds[3], score: 0 }
        ]);

        const after = (await groups()).json();
        expect(after.groups).toEqual(before.groups);
        expect(after.wildcard).toEqual(before.wildcard);
    });
});
