import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// Making a contestant — the one way onto a roster without Google.
//
// Players have no password and never sign in: the PIN claim mints their session.
// So the console must be able to CREATE the identity a seat points at, and these
// tests are the contract for that: a real PLAYER row, enrolled in the same call,
// never two the same name on one roster.

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const createUrl = () => `/portal/tournaments/${tournamentId}/players/new`;

const add = (displayName: string, cookie = ownerCookie) =>
    app.inject({
        method: "POST",
        url: createUrl(),
        headers: auth(cookie),
        payload: { displayName }
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db
        .insert(users)
        .values({ role: "OPERATOR", username: "roster-owner", displayName: "Roster Owner", tokenVersion: 0 })
        .returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const [tournament] = await db
        .insert(tournaments)
        .values({
            ownerId: owner.id,
            visibility: "PUBLIC",
            slug: "roster-tournament",
            name: "Roster Tournament",
            rounds: [{ id: "khoi-dong", name: "Khoi Dong", order: 0, chart: "bars" }],
            format: { competitorsPerMatch: 4 },
            stages: [{ id: "s1", title: "Stage s1" }]
        })
        .returning();
    tournamentId = tournament.id;
});

afterAll(async () => {
    await app.close();
});

describe("a contestant is created and enrolled in one call", () => {
    it("returns the new contestant, undrawn", async () => {
        const res = await add("An");
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ displayName: "An", group: null });
    });

    it("writes a real PLAYER row, with an email the schema requires", async () => {
        const res = await add("Bình");
        const { userId } = res.json() as { userId: string };

        const [row] = await db.select().from(users).where(eq(users.id, userId));
        expect(row.role).toBe("PLAYER");
        expect(row.displayName).toBe("Bình");
        // the PLAYER role requires an email; this one is a placeholder, never mailed
        expect(row.email).toMatch(/@players\.invalid$/);
        expect(row.passwordHash).toBeNull();
    });

    it("enrolls them in the tournament in the same call", async () => {
        const res = await add("Chi");
        const { userId } = res.json() as { userId: string };

        const rows = await db
            .select()
            .from(tournamentPlayers)
            .where(and(eq(tournamentPlayers.tournamentId, tournamentId), eq(tournamentPlayers.userId, userId)));
        expect(rows).toHaveLength(1);
        expect(rows[0].group).toBeNull();
    });

    it("trims the name", async () => {
        const res = await add("  Dũng  ");
        expect((res.json() as { displayName: string }).displayName).toBe("Dũng");
    });
});

describe("the roster refuses what an operator would regret", () => {
    it("refuses a second contestant with the same name", async () => {
        await add("Em");
        const res = await add("em"); // case-insensitive: the rail reads names
        expect(res.statusCode).toBe(409);
        expect((res.json() as { message: string }).message).toContain("already a contestant");
    });

    it("refuses an empty name", async () => {
        const res = await add("   ");
        // the schema's minLength(1) passes on spaces, so the service answers
        expect([400, 409]).toContain(res.statusCode);
    });

    it("refuses a caller who may not write the tournament", async () => {
        const [stranger] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "roster-stranger", displayName: "Stranger", tokenVersion: 0 })
            .returning();
        const cookie = signToken(app, "PORTAL", { sub: stranger.id, role: "OPERATOR", tokenVersion: 0 });

        const res = await add("Giang", cookie);
        expect(res.statusCode).toBe(403);
    });

    it("refuses an unauthenticated caller", async () => {
        const res = await app.inject({
            method: "POST",
            url: createUrl(),
            payload: { displayName: "Hà" }
        });
        expect(res.statusCode).toBe(401);
    });
});
