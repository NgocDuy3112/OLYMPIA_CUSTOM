import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

// The player surface's session endpoints: who am I, and signing out.
// The Google round-trip itself needs GOOGLE_OIDC_* configured and is not
// exercised here; the ?next= guard it uses is unit-tested in
// tests/unit/lib/redirect.test.ts.

let app: FastifyInstance;
let playerId: string;
let gameplayCookie: string;
let portalCookie: string;

const gameplaySession = (userId: string) =>
    signToken(app, "GAMEPLAY", { sub: userId, role: "PLAYER", tokenVersion: 0 });

beforeAll(async () => {
    app = await buildApp();

    const [player] = await db
        .insert(users)
        .values([
            { role: "PLAYER", email: "gauth-player@example.test", displayName: "GAuth Player", tokenVersion: 0 },
            { role: "ADMIN", username: "gauth-admin", displayName: "GAuth Admin", tokenVersion: 0 }
        ])
        .returning({ id: users.id, role: users.role });

    playerId = player.id;
    gameplayCookie = gameplaySession(playerId);
    portalCookie = signToken(app, "PORTAL", { sub: player.id, role: "PLAYER", tokenVersion: 0 });
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("GET /gameplay/auth/me", () => {
    it("401 without a session", async () => {
        const res = await app.inject({ method: "GET", url: "/gameplay/auth/me" });
        expect(res.statusCode).toBe(401);
    });

    it("401 with the portal's cookie — the surfaces do not cross", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gameplay/auth/me",
            headers: { cookie: `portal_session=${portalCookie}` }
        });
        expect(res.statusCode).toBe(401);
    });

    it("200 for a player — the session itself is the answer, no role gate", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/gameplay/auth/me",
            headers: { cookie: `gameplay_session=${gameplayCookie}` }
        });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body).toMatchObject({ id: playerId, role: "PLAYER" });
        // The public shape — never the secrets it is built from.
        expect(body).not.toHaveProperty("passwordHash");
        expect(body).not.toHaveProperty("totpSecret");
        expect(body).not.toHaveProperty("tokenVersion");
    });

    it("401 for a revoked session (tokenVersion moved on)", async () => {
        const stale = signToken(app, "GAMEPLAY", {
            sub: playerId,
            role: "PLAYER",
            tokenVersion: 999
        });
        const res = await app.inject({
            method: "GET",
            url: "/gameplay/auth/me",
            headers: { cookie: `gameplay_session=${stale}` }
        });
        expect(res.statusCode).toBe(401);
    });
});


describe("GET /gameplay/auth/google — the sign-in entry", () => {
    it("503 with a readable message when OIDC is not configured (not a bare 500)", async () => {
        // No GOOGLE_OIDC_* in the test environment — the configuration problem
        // is a service condition; the player gets an explanation.
        const res = await app.inject({
            method: "GET",
            url: "/gameplay/auth/google?next=/s/x"
        });
        expect(res.statusCode).toBe(503);
        expect(res.json().message).toContain("Google OIDC is not configured");
    });
});


describe("POST /gameplay/auth/logout", () => {
    it("200 and clears the gameplay cookie", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/gameplay/auth/logout",
            headers: { cookie: `gameplay_session=${gameplayCookie}` }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });

        const setCookie = res.headers["set-cookie"];
        const cleared = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie ?? "");
        expect(cleared).toContain("gameplay_session=");
        expect(cleared).toContain("Expires=Thu, 01 Jan 1970");
    });

    it("200 even without a session — signing out twice is fine", async () => {
        const res = await app.inject({ method: "POST", url: "/gameplay/auth/logout" });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
    });

    it("does not clear the portal's cookie", async () => {
        const res = await app.inject({ method: "POST", url: "/gameplay/auth/logout" });
        const setCookie = res.headers["set-cookie"];
        const all = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie ?? "");
        expect(all).not.toContain("portal_session=");
    });
});
