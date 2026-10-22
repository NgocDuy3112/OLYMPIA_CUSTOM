import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import { matchResults, matches, tournaments, tournaments } from "../src/db/schema/index.js";

const slug = process.argv[2] ?? "demo";
const round = Number(process.argv[3] ?? 1);
const stageId = `splitting-${round}`;

const [tournament] = await db.select().from(tournaments).where(eq(tournaments.slug, slug)).limit(1);
if (!tournament) throw new Error(`no tournament with slug "${slug}"`);

const tournamentRows = await db.select().from(tournaments).where(eq(tournaments.tournamentId, tournament.id));
const rows = await db
    .select()
    .from(matches)
    .where(and(eq(matches.tournamentId, tournamentRows[0].id), eq(matches.stageId, stageId), isNull(matches.deletedAt)));

if (rows.length === 0) throw new Error(`no matches for ${stageId} — draw that round first`);

for (const match of rows) {
    const seated = match.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []);

    const results = seated.map((userId, index) => ({
        kind: "user" as const,
        userId,
        // Slot 1 wins: deterministic, so a re-run produces the same table.
        totalScore: 10 - index,
        rank: index + 1,
        roundScores: {} as Record<string, number>
    }));

    await db
        .insert(matchResults)
        .values({ matchId: match.id, tournamentId: match.tournamentId, results })
        .onConflictDoUpdate({
            target: matchResults.matchId,
            set: { results, computedAt: new Date() }
        });

    await db.update(matches).set({ status: "FINISHED" }).where(eq(matches.id, match.id));
}

console.log(`finished ${rows.length} matches of ${stageId}`);
process.exit(0);