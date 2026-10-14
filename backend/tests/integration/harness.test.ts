import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { oauthAccounts, users } from "../../src/db/schema/index.js";


const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool);

afterAll(async () => {
    await pool.end();
});

describe("users: role enum + identity CHECK", () => {
    it("accepts an ADMIN staff user with a username", async () => {
        const inserted = await db
            .insert(users)
            .values({ role: "ADMIN", username: "harness-admin", displayName: "Harness" })
            .returning({ id: users.id });

        expect(inserted).toHaveLength(1);
    });

    it("rejects staff without a username", async () => {
        await expect(
            db.insert(users).values({ role: "OPERATOR", displayName: "NoName" })
        ).rejects.toThrow();
    });

    it("allows multiple players without usernames (nullable unique)", async () => {
        await db
            .insert(users)
            .values({ role: "PLAYER", email: "first@example.test", displayName: "First" });
        await db
            .insert(users)
            .values({ role: "PLAYER", email: "second@example.test", displayName: "Second" });

        const players = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, "PLAYER"));

        expect(players).toHaveLength(2);
    });
});

describe("oauth_accounts: (provider, sub) identity key", () => {
    it("rejects a duplicate provider+sub pair", async () => {
        const [owner] = await db
            .insert(users)
            .values({ role: "PLAYER", email: "oauth@example.test", displayName: "OAuth" })
            .returning({ id: users.id });

        await db
            .insert(oauthAccounts)
            .values({ userId: owner.id, provider: "google", sub: "stable-sub-1" });

        await expect(
            db
                .insert(oauthAccounts)
                .values({ userId: owner.id, provider: "google", sub: "stable-sub-1" })
        ).rejects.toThrow();
    });
});
