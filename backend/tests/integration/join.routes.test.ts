import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matches, tournaments, users } from "../../src/db/schema/index.js";

// The player's door — POST /gameplay/join/{lookup,claim} (modules/auth/join.ts).
// The PIN names the match; the claim mints the GAMEPLAY session for a seated
// seat. BOTH answers carry the tournament slug: the gameplay app lands the
// player straight on /s/:slug/matches/:id (the deck) with no resolver hop.

let app: FastifyInstance;
let playerId: string;
let outsiderId: string;
let matchId: string;
let slug: string;
const code = "JNSLUG";

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: `join-owner-${randomUUID().slice(0, 8)}`, displayName: "Join Owner", tokenVersion: 0
    }).returning();
    const [player] = await db.insert(users).values({
        role: "PLAYER", email: `join-player-${randomUUID().slice(0, 8)}@example.test`, displayName: "Seated Player", tokenVersion: 0
    }).returning();
    playerId = player.id;
    const [outsider] = await db.insert(users).values({
        role: "PLAYER", email: `join-outsider-${randomUUID().slice(0, 8)}@example.test`, displayName: "Not Seated", tokenVersion: 0
    }).returning();
    outsiderId = outsider.id;

    slug = `join-${randomUUID().slice(0, 8)}`;
    const [tournament] = await db.insert(tournaments).values({
        ownerId: owner.id, visibility: "PUBLIC", slug, name: "Join Cup",
        rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
        format: { competitorsPerMatch: 2, allowedSeatKinds: ["user"], teamSize: null, teamAggregation: null, teamCountAggregation: null },
        placementTiers: [{ min: 1, max: 2, points: 10 }],
        stages: [{ id: "s1", title: "Stage s1" }]
    }).returning();

    const [match] = await db.insert(matches).values({
        tournamentId: tournament.id, stageId: "s1", scheduledAt: new Date(), label: "Join Match", status: "UPCOMING",
        joinCode: code,
        players: [{ kind: "user", userId: playerId, seed: 1 }],
        roundConfigs: {
            "khoi-dong": { allowedKinds: ["TEXT"], scoring: { template: "constant", points: 10 }, turns: [] }
        },
        questions: []
    }).returning();
    matchId = match.id;
});

afterAll(async () => {
    await app.close();
});

describe("join lookup", () => {
    it("names the match, its seats AND the tournament slug", async () => {
        const res = await app.inject({ method: "POST", url: "/gameplay/join/lookup", payload: { code } });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            matchId,
            slug,
            label: "Join Match",
            status: "UPCOMING",
            seats: [{ userId: playerId, displayName: "Seated Player" }],
        });
    });

    it("404s a code nobody issued", async () => {
        const res = await app.inject({ method: "POST", url: "/gameplay/join/lookup", payload: { code: "NOPE99" } });
        expect(res.statusCode).toBe(404);
    });
});

describe("join claim", () => {
    it("mints the seated player's gameplay session and returns the slug", async () => {
        const res = await app.inject({
            method: "POST", url: "/gameplay/join/claim", payload: { code, userId: playerId },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ matchId, slug, displayName: "Seated Player" });
        expect(res.headers["set-cookie"]).toBeDefined();
    });

    it("403s a player who is not seated at this table", async () => {
        const res = await app.inject({
            method: "POST", url: "/gameplay/join/claim", payload: { code, userId: outsiderId },
        });
        expect(res.statusCode).toBe(403);
    });
});
