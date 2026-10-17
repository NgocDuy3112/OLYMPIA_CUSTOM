import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";

let app: FastifyInstance;
let adminId: string;
let adminCookie: string;
let playerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER", tokenVersion = 0) =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "sess-admin", displayName: "Admin" },
            { role: "PLAYER", email: "sess-player@example.test", displayName: "Player" }
        ])
        .returning({ id: users.id });

    adminId = rows[0].id;
    adminCookie = portalCookie(adminId, "ADMIN");
    playerCookie = portalCookie(rows[1].id, "PLAYER");
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});

describe("GET /portal/auth/me", () => {
    it("401 without a session", async () => {
        const res = await app.inject({ method: "GET", url: "/portal/auth/me" });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/auth/me",
            headers: auth(playerCookie)
        });
        expect(res.statusCode).toBe(403);
    });

    it("200 returns the public shape and never leaks secrets", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/auth/me",
            headers: auth(adminCookie)
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();

        expect(body).toMatchObject({ id: adminId, username: "sess-admin", role: "ADMIN" });
        expect(body.totpEnabled).toBe(false);

        for (const leaked of [
            "passwordHash", "totpSecret", "totpLastUsedStep", "discordId", "email"
        ]) {
            expect(body).not.toHaveProperty(leaked);
        }
    });

    it("401 once the session is revoked by a token-version bump", async () => {
        await db.update(users).set({ tokenVersion: 1 }).where(eq(users.id, adminId));

        const res = await app.inject({
            method: "GET",
            url: "/portal/auth/me",
            headers: auth(adminCookie)
        });
        expect(res.statusCode).toBe(401);

        await db.update(users).set({ tokenVersion: 0 }).where(eq(users.id, adminId));
    });
});

describe("POST /portal/auth/logout", () => {
    it("clears the cookie and is idempotent", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/auth/logout",
            headers: auth(adminCookie)
        });

        expect(res.statusCode).toBe(200);
        expect(String(res.headers["set-cookie"])).toMatch(/portal_session=.*(Expires=|Max-Age=0)/i);

        const again = await app.inject({ method: "POST", url: "/portal/auth/logout" });
        expect(again.statusCode).toBe(200);
    });
});