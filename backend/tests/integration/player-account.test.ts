import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matches, tournaments, users } from "../../src/db/schema/index.js";
import { signVerifyEmail } from "../../src/lib/jwt.js";

// A player's OWN account: register → verify by link → log in → "which match am I
// in". The identity is the player's, not the operator's: nobody at the desk ever
// types (or sees) this password.

let app: FastifyInstance;
const EMAIL = "player-account@example.test";
const PASSWORD = "mat-khau-42";

const register = (over: Record<string, unknown> = {}) =>
    app.inject({
        method: "POST",
        url: "/gameplay/auth/register",
        payload: { email: EMAIL, password: PASSWORD, displayName: "Bạn Mới", ...over },
    });

const login = (over: Record<string, unknown> = {}) =>
    app.inject({
        method: "POST",
        url: "/gameplay/auth/login",
        payload: { email: EMAIL, password: PASSWORD, ...over },
    });

const cookieOf = (res: { headers: Record<string, unknown> }) => String(res.headers["set-cookie"] ?? "");

beforeAll(async () => {
    app = await buildApp();
    await app.ready();
});

afterAll(async () => {
    await app.close();
});

describe("registering", () => {
    it("accepts an email and a password, and creates NO session", async () => {
        const res = await register();
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ pendingVerification: true, to: EMAIL });
        // no session cookie: the account is not usable until the link is opened
        expect(cookieOf(res)).toBe("");
    });

    it("stores a hash, not the password, and leaves the address unverified", async () => {
        const [row] = await db.select().from(users).where(eq(users.email, EMAIL));
        expect(row.role).toBe("PLAYER");
        expect(row.emailVerified).toBe(false);
        expect(row.passwordHash).toMatch(/^\$argon2/);
        expect(row.passwordHash).not.toContain(PASSWORD);
    });

    it("refuses a second account on the same address", async () => {
        expect((await register()).statusCode).toBe(409);
    });

    it("refuses a short password, and a malformed address", async () => {
        expect((await register({ email: "other@example.test", password: "short" })).statusCode).toBe(400);
        expect((await register({ email: "not-an-email" })).statusCode).toBe(400);
    });
});

describe("logging in", () => {
    it("refuses an unverified address, and says why", async () => {
        const res = await login();
        expect(res.statusCode).toBe(403);
        expect((res.json() as { message: string }).message).toContain("chưa được xác thực");
    });

    it("sets a session once the link has been opened", async () => {
        const [row] = await db.select().from(users).where(eq(users.email, EMAIL));
        const token = signVerifyEmail(app, row!.id);

        const verified = await app.inject({ method: "GET", url: `/gameplay/auth/verify?token=${token}` });
        expect(verified.statusCode).toBe(302);
        expect(verified.headers.location).toBe("/login?verify=ok");

        const res = await login();
        expect(res.statusCode).toBe(200);
        expect(cookieOf(res)).toContain("gameplay_session=");
        expect((res.json() as { displayName: string }).displayName).toBe("Bạn Mới");
    });

    it("says the same thing for a wrong password and an unknown address", async () => {
        const wrong = await login({ password: "khong-dung" });
        const unknown = await login({ email: "khong-co@example.test" });
        expect(wrong.statusCode).toBe(401);
        expect(unknown.statusCode).toBe(401);
        expect((wrong.json() as { message: string }).message).toBe((unknown.json() as { message: string }).message);
    });

    it("answers 302 with a reason when the link is garbage or expired", async () => {
        const bad = await app.inject({ method: "GET", url: "/gameplay/auth/verify?token=rac" });
        expect(bad.statusCode).toBe(302);
        expect(bad.headers.location).toBe("/login?verify=expired");
    });
});

describe("which match am I in", () => {
    const session = async () => {
        const res = await login();
        const raw = cookieOf(res).split("gameplay_session=")[1] ?? "";
        return { cookie: `gameplay_session=${raw.split(";")[0]}` };
    };

    it("answers an empty list for a player in no match", async () => {
        const res = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: await session() });
        expect(res.statusCode).toBe(200);
        expect((res.json() as { items: unknown[] }).items).toEqual([]);
    });

    it("finds the match they are seated in, and ignores a finished one", async () => {
        const [player] = await db.select().from(users).where(eq(users.email, EMAIL));
        const [operator] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "seat-op", displayName: "Seat Op", tokenVersion: 0 })
            .returning();

        const [tournament] = await db
            .insert(tournaments)
            .values({
                ownerId: operator!.id,
                visibility: "PUBLIC",
                slug: "seat-tournament",
                name: "Seat Tournament",
                rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
                format: { competitorsPerMatch: 3 },
                stages: [{ id: "s1", title: "Stage" }],
            })
            .returning();

        const seat = [{ kind: "user" as const, userId: player!.id, seed: 1 }];
        const base = {
            tournamentId: tournament!.id,
            stageId: "s1",
            scheduledAt: new Date(),
            roundConfigs: {},
            questions: [],
            players: seat,
        };
        await db.insert(matches).values({ ...base, label: "Sắp diễn ra", status: "UPCOMING" });
        await db.insert(matches).values({ ...base, label: "Đã xong", status: "FINISHED", slot: 2 });

        const res = await app.inject({ method: "GET", url: "/gameplay/me/match", headers: await session() });
        const items = (res.json() as { items: Array<{ label: string; slug: string }> }).items;
        expect(items.map((item) => item.label)).toEqual(["Sắp diễn ra"]);
        expect(items[0]?.slug).toBe("seat-tournament");
    });

    it("refuses without a session", async () => {
        const res = await app.inject({ method: "GET", url: "/gameplay/me/match" });
        expect(res.statusCode).toBe(401);
    });
});
