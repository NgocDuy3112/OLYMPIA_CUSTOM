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
        // Step 8: the handle is what every role signs in with, so `users.username`
        // is NOT NULL in the schema AND in the table. The type already refuses
        // this line; the database refuses it too, and that second refusal is the
        // one being asserted (a code path that forgot a handle cannot sneak one in).
        await expect(
            // @ts-expect-error — the very absence this test is about
            db.insert(users).values({ role: "PLAYER", displayName: "NoHandle", email: "nohandle@example.test" })
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

        // The handle is the login key: two accounts sharing one would be a typed
        // name landing on either player. (Case-INSENSITIVE collisions are refused
        // one layer up, in lib/username.ts, where handles are minted.)
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
