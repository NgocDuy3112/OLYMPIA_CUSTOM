import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { mcpKeys, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import { hashMcpKey, verifyMcpToken } from "../../src/modules/mcp-keys/index.js";


let app: FastifyInstance;
let adminId: string;
let ownerId: string;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const createKey = (payload: object, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: "/portal/mcp-keys", headers: auth(cookie), payload });

const listKeys = (query = "", cookie = ownerCookie) =>
    app.inject({ method: "GET", url: `/portal/mcp-keys${query}`, headers: auth(cookie) });

const revokeKey = (id: string, cookie = ownerCookie) =>
    app.inject({ method: "DELETE", url: `/portal/mcp-keys/${id}`, headers: auth(cookie) });

const KEY_SHAPE = /^ocmcp_[0-9a-f]{8}_[0-9a-f]{64}$/;

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "mk-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "mk-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "mk-other", displayName: "Other" },
            { role: "PLAYER", email: "mk-player@example.test", displayName: "Player" }
        ])
        .returning({ id: users.id });

    adminId = rows[0].id;
    ownerId = rows[1].id;
    adminCookie = portalCookie(adminId, "ADMIN");
    ownerCookie = portalCookie(ownerId, "OPERATOR");
    otherCookie = portalCookie(rows[2].id, "OPERATOR");
    playerCookie = portalCookie(rows[3].id, "PLAYER");
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("POST /portal/mcp-keys — issuance", () => {
    it("401 anonymous, 403 for a PLAYER", async () => {
        const anon = await app.inject({
            method: "POST",
            url: "/portal/mcp-keys",
            payload: { label: "no session" }
        });
        expect(anon.statusCode).toBe(401);

        expect((await createKey({ label: "player" }, playerCookie)).statusCode).toBe(403);
    });

    it("201 returns the token exactly once, with hash stored instead", async () => {
        const res = await createKey({ label: "laptop" });

        expect(res.statusCode).toBe(201);
        const body = res.json();

        expect(body.token).toMatch(KEY_SHAPE);
        expect(body.key.prefix).toBe(body.token.split("_")[1]);
        expect(body.key.scopes).toEqual(["READ"]);
        expect(body.key.expiresAt).toBeNull();
        expect(body.key.revokedAt).toBeNull();
        expect(body.key).not.toHaveProperty("keyHash");

        // the raw token is never persisted — only its sha256
        const [row] = await db.select().from(mcpKeys).where(eq(mcpKeys.id, body.key.id));
        expect(row.keyHash).toBe(hashMcpKey(body.token));
        expect(row.keyHash).not.toContain(body.token);
    });

    it("accepts explicit scopes and an expiry", async () => {
        const res = await createKey({
            label: "agent",
            scopes: ["READ", "WRITE"],
            expiresAt: "2030-01-01T00:00:00Z"
        });

        expect(res.statusCode).toBe(201);
        expect(res.json().key.scopes).toEqual(["READ", "WRITE"]);
        expect(res.json().key.expiresAt).not.toBeNull();
    });

    it("400 on duplicate scopes, an unknown scope, an empty label or a bad date", async () => {
        expect((await createKey({ label: "dup", scopes: ["READ", "READ"] })).statusCode).toBe(400);
        expect((await createKey({ label: "bad", scopes: ["ADMIN"] })).statusCode).toBe(400);
        expect((await createKey({ label: "" })).statusCode).toBe(400);
        expect((await createKey({ label: "bad date", expiresAt: "not-a-date" })).statusCode).toBe(400);
    });

    it("issues a distinct token per call", async () => {
        const first = await createKey({ label: "one" });
        const second = await createKey({ label: "two" });

        expect(first.json().token).not.toBe(second.json().token);
        expect(first.json().key.prefix).not.toBe(second.json().key.prefix);
    });
});


describe("GET /portal/mcp-keys — listing", () => {
    it("401 anonymous, 403 for a PLAYER", async () => {
        expect((await app.inject({ method: "GET", url: "/portal/mcp-keys" })).statusCode).toBe(401);
        expect((await listKeys("", playerCookie)).statusCode).toBe(403);
    });

    it("shows only the caller's keys, and never the hash or the token", async () => {
        await createKey({ label: "mine" });

        const res = await listKeys();

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(Object.keys(body).sort()).toEqual(["items", "limit", "offset", "total"]);
        expect(body.items.length).toBeGreaterThan(0);
        expect(body.items.every((k: { userId: string }) => k.userId === ownerId)).toBe(true);
        expect(body.items.every((k: { keyHash?: string }) => k.keyHash === undefined)).toBe(true);
        expect(JSON.stringify(body)).not.toContain("ocmcp_");
    });

    it("an OPERATOR cannot widen the scope with ?userId=", async () => {
        const res = await listKeys(`?userId=${adminId}`);

        expect(res.statusCode).toBe(200);
        expect(res.json().items.every((k: { userId: string }) => k.userId === ownerId)).toBe(true);
    });

    it("an ADMIN sees every key, and can filter by owner", async () => {
        const all = await listKeys("", adminCookie);
        expect(all.json().total).toBeGreaterThan(0);

        const filtered = await listKeys(`?userId=${ownerId}`, adminCookie);
        expect(filtered.json().items.every((k: { userId: string }) => k.userId === ownerId)).toBe(true);
    });
});


describe("DELETE /portal/mcp-keys/:id — revocation", () => {
    it("204 for the owner, idempotent on repeat, and not a deletion", async () => {
        const created = await createKey({ label: "to revoke" });
        const id = created.json().key.id;

        expect((await revokeKey(id)).statusCode).toBe(204);
        expect((await revokeKey(id)).statusCode).toBe(204);

        const [row] = await db.select().from(mcpKeys).where(eq(mcpKeys.id, id));
        expect(row.revokedAt).not.toBeNull();          // row survives, just revoked
        expect(row.keyHash).toBeTruthy();
    });

    it("404 when an operator revokes someone else's key", async () => {
        const created = await createKey({ label: "not yours" }, adminCookie);
        expect((await revokeKey(created.json().key.id, ownerCookie)).statusCode).toBe(404);
    });

    it("204 when an ADMIN revokes someone else's key", async () => {
        const created = await createKey({ label: "admin cleanup" });
        expect((await revokeKey(created.json().key.id, adminCookie)).statusCode).toBe(204);
    });

    it("404 for an unknown id", async () => {
        const res = await revokeKey("00000000-0000-4000-8000-000000000000");
        expect(res.statusCode).toBe(404);
    });
});


describe("verifyMcpToken", () => {
    it("accepts a fresh token and records usage", async () => {
        const created = await createKey({ label: "verify me" });
        const token = created.json().token;
        const id = created.json().key.id;

        const verified = await verifyMcpToken(token, { ip: "10.0.0.1", userAgent: "agent/1.0" });

        expect(verified.key.id).toBe(id);
        expect(verified.user.id).toBe(ownerId);

        const [row] = await db.select().from(mcpKeys).where(eq(mcpKeys.id, id));
        expect(row.lastIp).toBe("10.0.0.1");
        expect(row.lastUserAgent).toBe("agent/1.0");
        expect(row.lastUsedAt).not.toBeNull();
    });

    it("updates last_used_at on every call but last_ip only on change", async () => {
        const created = await createKey({ label: "usage" });
        const token = created.json().token;
        const id = created.json().key.id;

        await verifyMcpToken(token, { ip: "10.0.0.1", userAgent: "agent/1.0" });
        const [first] = await db.select().from(mcpKeys).where(eq(mcpKeys.id, id));

        await new Promise((resolve) => setTimeout(resolve, 10));
        await verifyMcpToken(token, { ip: "10.0.0.1", userAgent: "agent/1.0" });
        const [second] = await db.select().from(mcpKeys).where(eq(mcpKeys.id, id));

        expect(second.lastUsedAt.getTime()).toBeGreaterThan(first.lastUsedAt.getTime());
        expect(second.lastIp).toBe("10.0.0.1");
    });

    it("rejects malformed, unknown, revoked and expired tokens", async () => {
        await expect(verifyMcpToken("not-a-key")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
        await expect(
            verifyMcpToken("ocmcp_00000000_" + "0".repeat(64))
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        // same prefix as a real key, wrong secret
        const real = await createKey({ label: "prefix reuse" });
        const [marker, prefix] = real.json().token.split("_");
        await expect(
            verifyMcpToken(`${marker}_${prefix}_${"a".repeat(64)}`)
        ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

        const revocable = await createKey({ label: "revoked soon" });
        await revokeKey(revocable.json().key.id);
        await expect(verifyMcpToken(revocable.json().token)).rejects.toMatchObject({
            code: "UNAUTHORIZED"
        });

        const expired = await createKey({ label: "expired", expiresAt: "2020-01-01T00:00:00Z" });
        await expect(verifyMcpToken(expired.json().token)).rejects.toMatchObject({
            code: "UNAUTHORIZED"
        });
    });

    it("rejects a token whose owner has been disabled", async () => {
        const created = await createKey({ label: "disabled owner" });
        const id = created.json().key.id;

        await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, ownerId));
        await expect(verifyMcpToken(created.json().token)).rejects.toMatchObject({
            code: "UNAUTHORIZED"
        });

        await db.update(users).set({ disabledAt: null }).where(eq(users.id, ownerId));
        await expect(verifyMcpToken(created.json().token)).resolves.toBeDefined();
        expect(id).toBeTruthy();
    });
});
