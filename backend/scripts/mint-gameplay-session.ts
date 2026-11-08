import { and, desc, eq, inArray, or, ilike } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { matches, tournaments, users } from "../src/db/schema/index.js";
import { buildApp } from "../src/app.js";
import { signToken } from "../src/lib/jwt.js";

async function main() {
    const wanted = process.argv[2];

    const [match] = await db
        .select()
        .from(matches)
        .orderBy(desc(matches.createdAt))
        .limit(1);
    if (!match) throw new Error("no match in the database — create one first");

    const seated = match.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []
    );
    if (seated.length === 0) throw new Error("the match has nobody seated");

    const conditions = [inArray(users.id, seated)];
    if (wanted) {
        conditions.push(or(ilike(users.displayName, `%${wanted}%`), ilike(users.email, `%${wanted}%`))!);
    }
    const [player] = await db.select().from(users).where(and(...conditions)).limit(1);
    if (!player) {
        const roster = await db.select({ name: users.displayName }).from(users).where(inArray(users.id, seated));
        throw new Error(`no seated player matches "${wanted}". Roster: ${roster.map((r) => r.name).join(", ")}`);
    }

    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, match.tournamentId));

    const app = await buildApp();
    await app.ready();
    const token = signToken(app, "GAMEPLAY", {
        sub: player.id,
        role: player.role as "PLAYER",
        tokenVersion: player.tokenVersion,
    });
    await app.close();

    const url = `http://localhost:5175/s/${tournament.slug}/matches/${match.id}`;
    console.log(`
match:  ${match.label} (${match.questions.length} questions, rounds=${Object.keys(match.roundConfigs).length})
player: ${player.displayName}  (${wanted ? `matched "${wanted}"` : "first seated"})
url:    ${url}

Paste this in the browser console on localhost:5175 (or DevTools → Application → Cookies):

  document.cookie = "gameplay_session=${token}; path=/"

Then reload. Sign-out = delete the cookie. Re-run with a name/email to mint another.`);
    process.exit(0);
}

void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
