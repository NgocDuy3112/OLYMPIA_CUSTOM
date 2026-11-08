import { eq } from "drizzle-orm";
import { db, pool } from "../src/db/pool.js";
import { users } from "../src/db/schema/index.js";
import { buildApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";

async function main() {
    const username = process.argv[2];
    if (!username) {
        throw new Error("usage: mint-portal-session.ts <username>");
    }

    const [user] = await db
        .select({ id: users.id, role: users.role, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
    if (!user) throw new Error(`no user with username "${username}"`);
    if (user.role !== "ADMIN" && user.role !== "OPERATOR") {
        throw new Error(`"${username}" is ${user.role} — only staff sign in to the portal`);
    }

    const app = await buildApp();
    await app.ready();
    const cookie = signToken(app, "PORTAL", {
        sub: user.id,
        role: user.role,
        tokenVersion: user.tokenVersion
    });
    await app.close();

    console.log(`portal_session=${cookie}`);
}

main()
    .then(() => pool.end())
    .catch(async (error) => {
        console.error(error instanceof Error ? error.message : error);
        await pool.end();
        process.exitCode = 1;
    });
