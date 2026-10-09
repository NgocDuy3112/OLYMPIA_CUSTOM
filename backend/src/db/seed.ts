import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { db } from "./pool.js";
import { users } from "./schema.js";

const MIN_PASSWORD_LENGTH = 12;

function seedConfig() {
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) {
        throw new Error("Missing required environment variable: SEED_ADMIN_PASSWORD");
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(
            `SEED_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`
        );
    }
    const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
    return { password, username };
}


async function adminExists(username: string): Promise<boolean> {
    const [existing] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

    if (existing && existing.role !== "admin") {
        throw new Error(
            `Username "${username}" is taken by a ${existing.role}; pick another via SEED_ADMIN_USERNAME`
        );
    }
    return Boolean(existing);
}


async function main() {
    const { password, username } = seedConfig();

    if (await adminExists(username)) {
        console.log(`Admin "${username}" already exists — nothing to do.`);
        return;
    }

    const passwordHash = await argon2.hash(password);

    await db.insert(users).values({
        role: "admin",
        username,
        displayName: username,
        passwordHash,
    });

    console.log(`Admin "${username}" created.`);
    console.log("TOTP enrollment happens on first login.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Seed failed:", error instanceof Error ? error.message : error);
        process.exit(1);
    });