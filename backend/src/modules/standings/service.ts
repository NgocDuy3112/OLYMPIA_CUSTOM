// The season's standings: a placement table.
//
// The place of a player is how far they got — the last stage they played, the match
// they were eliminated in, and their rank in it. The points are a statistic, not the
// ranking key. See `src/game/engine/scoring/standings.ts` for the rules.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchResults,
    matches,
    seasonPlayers,
    seasonStandings,
    seasons,
    users
} from "../../db/schema/index.js";
import type { ResultEntry } from "../../game/contracts/index.js";
import {
    buildStandings,
    type MatchResultInput,
    type PlayerStanding,
    type StageRef
} from "../../game/engine/scoring/standings.js";

// The points matches of the season, with their results.
async function seasonMatches(seasonId: string): Promise<MatchResultInput[]> {
    const rows = await db
        .select({
            matchId: matches.id,
            stageId: matches.stageId,
            slot: matches.slot,
            results: matchResults.results
        })
        .from(matches)
        .innerJoin(matchResults, eq(matchResults.matchId, matches.id))
        .where(and(
            eq(matches.seasonId, seasonId),
            eq(matches.kind, "STANDARD"),
            isNull(matches.deletedAt)
        ))
        .orderBy(asc(matches.scheduledAt), asc(matches.slot));

    return rows.map((row) => ({
        matchId: row.matchId,
        stageId: row.stageId,
        slot: row.slot,
        results: (row.results as ResultEntry[]).flatMap((entry) =>
            entry.kind === "user" && entry.userId
                ? [{ userId: entry.userId, totalScore: entry.totalScore, rank: entry.rank }]
                : [])
    }));
}

// The season's stages, in order: this is the order of the season.
async function seasonStages(seasonId: string): Promise<StageRef[]> {
    const [row] = await db.select().from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!row) return [];
    return (row.stages ?? []).map((stage) => ({ id: stage.id, title: stage.title }));
}

// The roster: everyone enrolled in the season.
async function seasonRoster(seasonId: string): Promise<Array<{ userId: string; displayName: string }>> {
    return db
        .select({ userId: seasonPlayers.userId, displayName: users.displayName })
        .from(seasonPlayers)
        .innerJoin(users, eq(users.id, seasonPlayers.userId))
        .where(eq(seasonPlayers.seasonId, seasonId));
}

// The table.
export async function getStandings(seasonId: string): Promise<PlayerStanding[]> {
    const [season] = await db.select().from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!season) return [];

    return buildStandings({
        stages: await seasonStages(seasonId),
        matches: await seasonMatches(seasonId),
        players: await seasonRoster(seasonId),
        tiers: season.placementTiers ?? []
    });
}

// Recompute and store the table. The stored row is the season's record of the places;
// the never-played are not in it (they have no place).
export async function recomputeStandings(seasonId: string): Promise<PlayerStanding[]> {
    const rows = await getStandings(seasonId);
    const placed = rows.filter((row) => row.place !== null);

    await db.transaction(async (tx) => {
        await tx.delete(seasonStandings).where(eq(seasonStandings.seasonId, seasonId));
        if (placed.length > 0) {
            await tx.insert(seasonStandings).values(placed.map((row) => ({
                seasonId,
                userId: row.userId,
                totalScore: row.totalPoints,
                rank: row.place!,
                placementPoints: row.placementPoints
            })));
        }
    });

    return rows;
}

// The names of the players in a list of ids — used by the portal.
export async function namesOf(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    const rows = await db.select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds));
    return Object.fromEntries(rows.map((row) => [row.id, row.displayName]));
}
