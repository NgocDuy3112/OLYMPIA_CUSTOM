import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matches, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// The LOBBY endpoints — the waiting screen both shells render:
//   portal   GET /portal/tournaments/:tid/matches/:mid/lobby   (the MC)
//   gameplay GET /gameplay/matches/:mid/lobby                  (a seated player)
// Same payload (lobbyOf); only the gate differs. Proves identity, rounds in
// tournament order, the seats' totals, presence, and that the gates hold.

let app: FastifyInstance;
let ownerCookie: string;
let seatedCookie: string;
let outsiderCookie: string;
let tournamentId: string;
let matchId: string;
let missingMatchId: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const asPlayer = (cookie: string) => ({ cookie: `gameplay_session=${cookie}` });

const mcLobbyUrl = () => `/portal/tournaments/${tournamentId}/matches/${matchId}/lobby`;
const playerLobbyUrl = () => `/gameplay/matches/${matchId}/lobby`;

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: `lobby-owner-${randomUUID().slice(0, 8)}`, displayName: "Lobby Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const [player] = await db.insert(users).values({
        role: "PLAYER", email: `lobby-player-${randomUUID().slice(0, 8)}@example.test`, displayName: "Seated Player", tokenVersion: 0
    }).returning();
    seatedCookie = signToken(app, "GAMEPLAY", { sub: player.id, role: "PLAYER", tokenVersion: 0 });

    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: `lobby-outsider-${randomUUID().slice(0, 8)}@example.test`, displayName: "Outsider", tokenVersion: 0
    }).returning();
    outsiderCookie = signToken(app, "GAMEPLAY", { sub: outsider.id, role: "PLAYER", tokenVersion: 0 });

    const [tournament] = await db.insert(tournaments).values({
        ownerId: owner.id, visibility: "PUBLIC", tags: ["THTH"],
        slug: `lobby-${randomUUID().slice(0, 8)}`,
        name: "Lobby Cup",
        // Deliberately NOT alphabetical: the lobby must show declared order.
        rounds: [
            { id: "but-pha", name: "But Pha", order: 1, chart: "bars" },
            { id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }
        ],
        format: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();
    tournamentId = tournament.id;

    const [match] = await db.insert(matches).values({
        tournamentId, stageId: "s1", scheduledAt: new Date(), label: "Lobby Match", status: "UPCOMING",
        joinCode: "LOBBY1",
        players: [{ kind: "user", userId: player.id, seed: 1 }],
        roundConfigs: {
            // Both orders present; the tournament's order (khoi-dong first) wins.
            "but-pha": { allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: [] },
            "khoi-dong": { allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: [] }
        },
        questions: []
    }).returning();
    matchId = match.id;

    // The lobby must also answer for a match that never went LIVE (no live row).
    missingMatchId = randomUUID();
});

afterAll(async () => {
    await app.close();
});

describe("the MC's lobby (portal)", () => {
    it("answers before the match is LIVE — identity, declared round order, seats", async () => {
        const res = await app.inject({ method: "GET", url: mcLobbyUrl(), headers: auth(ownerCookie) });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toMatchObject({
            title: "Lobby Cup",
            label: "Lobby Match",
            status: "UPCOMING",
            roundId: "khoi-dong",           // no live row → the match's FIRST round
            connected: [],
        });
        // Tournament's declared order, not the config object's.
        expect(body.rounds.map((r: { id: string }) => r.id)).toEqual(["khoi-dong", "but-pha"]);
        expect(body.rounds.map((r: { name: string }) => r.name)).toEqual(["Khoi Dong", "But Pha"]);
        expect(body.table).toHaveLength(1);
        expect(body.table[0]).toMatchObject({ displayName: "Seated Player", points: 0 });
    });

    it("refuses a player's session — the portal gate holds", async () => {
        const res = await app.inject({ method: "GET", url: mcLobbyUrl(), headers: asPlayer(seatedCookie) });
        expect(res.statusCode).toBe(401);
    });

    it("404 for a match that does not exist (MatchError → status, not a 500)", async () => {
        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${tournamentId}/matches/${missingMatchId}/lobby`,
            headers: auth(ownerCookie)
        });
        expect(res.statusCode).toBe(404);
    });
});

describe("the player's lobby (gameplay)", () => {
    it("answers a seated player with the same payload", async () => {
        const res = await app.inject({ method: "GET", url: playerLobbyUrl(), headers: asPlayer(seatedCookie) });
        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toMatchObject({ title: "Lobby Cup", label: "Lobby Match", status: "UPCOMING" });
        expect(body.table.map((r: { displayName: string }) => r.displayName)).toEqual(["Seated Player"]);
    });

    it("403 for a signed-in player who is not seated", async () => {
        const res = await app.inject({ method: "GET", url: playerLobbyUrl(), headers: asPlayer(outsiderCookie) });
        expect(res.statusCode).toBe(403);
    });

    it("401 without a session", async () => {
        const res = await app.inject({ method: "GET", url: playerLobbyUrl() });
        expect(res.statusCode).toBe(401);
    });
});

describe("presence on the lobby", () => {
    it("connected follows the hub: subscribe → dot appears → unsubscribe → gone", async () => {
        // The hub is in-process; subscribe directly (the HTTP shape is asserted
        // above) — this proves connectedUsers feeds the lobby payload.
        const { connectedUsers, subscribe } = await import("../../src/modules/live/hub.js");
        const fakeId = "00000000-0000-4000-8000-000000000001";

        const unsubscribe = subscribe(matchId, { userId: fakeId, push: async () => {} });
        const res = await app.inject({ method: "GET", url: playerLobbyUrl(), headers: asPlayer(seatedCookie) });
        expect(res.json().connected).toContain(fakeId);

        unsubscribe();
        expect(connectedUsers(matchId)).not.toContain(fakeId);
    });
});
