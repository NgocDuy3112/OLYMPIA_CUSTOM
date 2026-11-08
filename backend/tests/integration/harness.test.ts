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

    it("refuses any row with no handle — username is the identity, in type and in SQL", async () => {
        await expect(
            db.insert(users).values({
                role: "PLAYER",
                displayName: "NoHandle",
                email: "nohandle@example.test",
            } as unknown as typeof users.$inferInsert)
        ).rejects.toThrow();
    });

    it("refuses a second account with the same handle", async () => {
        await db
            .insert(users)
            .values({ role: "PLAYER", username: "first", email: "first@example.test", displayName: "First" });
        await db
            .insert(users)
            .values({ role: "PLAYER", username: "second", email: "second@example.test", displayName: "Second" });

        const players = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.role, "PLAYER"));

        expect(players).toHaveLength(2);

        await expect(
            db.insert(users).values({ role: "PLAYER", username: "first", email: "third@example.test", displayName: "Third" })
        ).rejects.toThrow();
    });
});

describe("oauth_accounts: (provider, sub) identity key", () => {
    it("rejects a duplicate provider+sub pair", async () => {
        const [owner] = await db
            .insert(users)
            .values({ role: "PLAYER", username: "oauth", email: "oauth@example.test", displayName: "OAuth" })
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
