// Mint gameplay cookies for every L4 seat — the idle players still have to take
// their ve-dich turns over the same player HTTP surface.
//   npx tsx --env-file=../configs/.env scripts/_mint-l4.ts
import { readFileSync, writeFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { users } from "../src/db/schema/index.js";
import { buildApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";

async function main() {
    const summary = JSON.parse(readFileSync("/tmp/l4-summary.json", "utf8"));
    const ids = summary.players.map((p: { id: string }) => p.id);

    const rows = await db.select().from(users).where(inArray(users.id, ids));
    const app = await buildApp();
    await app.ready();

    const tokens: Record<string, string> = {};
    for (const row of rows) {
        tokens[row.id] = signToken(app, "GAMEPLAY", {
            sub: row.id,
            role: "PLAYER" as const,
            tokenVersion: row.tokenVersion,
        });
    }
    await app.close();

    writeFileSync("/tmp/l4-player-tokens.json", JSON.stringify(tokens, null, 2));
    console.log(`minted ${Object.keys(tokens).length} player tokens → /tmp/l4-player-tokens.json`);
    process.exit(0);
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
