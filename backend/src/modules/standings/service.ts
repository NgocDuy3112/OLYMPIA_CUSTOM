// The tournament's standings: a placement table.
//
// The place of a player is how far they got — the last stage they played, the match
// they were eliminated in, and their rank in it. The points are a statistic, not the
// ranking key. See `src/game/engine/scoring/standings.ts` for the rules.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchResults,
    matches,
    tournamentPlayers,
    tournamentStandings,
    tournaments,
    users
} from "../../db/schema/index.js";
import type { ResultEntry } from "../../game/contracts/index.js";
import {
    buildStandings,
    type MatchResultInput,
    type PlayerStanding,
    type StageRef
} from "../../game/engine/scoring/standings.js";

// The points matches of the tournament, with their results.
async function tournamentMatches(tournamentId: string): Promise<MatchResultInput[]> {
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
            eq(matches.tournamentId, tournamentId),
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

// The tournament's stages, in order: this is the order of the tournament.
async function tournamentStages(tournamentId: string): Promise<StageRef[]> {
    const [row] = await db.select().from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!row) return [];
    return (row.stages ?? []).map((stage) => ({ id: stage.id, title: stage.title }));
}

// The roster: everyone enrolled in the tournament.
async function tournamentRoster(tournamentId: string): Promise<Array<{ userId: string; displayName: string }>> {
    return db
        .select({ userId: tournamentPlayers.userId, displayName: users.displayName })
        .from(tournamentPlayers)
        .innerJoin(users, eq(users.id, tournamentPlayers.userId))
        .where(eq(tournamentPlayers.tournamentId, tournamentId));
}

// The table.
export async function getStandings(tournamentId: string): Promise<PlayerStanding[]> {
    const [tournament] = await db.select().from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!tournament) return [];

    return buildStandings({
        stages: await tournamentStages(tournamentId),
        matches: await tournamentMatches(tournamentId),
        players: await tournamentRoster(tournamentId),
        tiers: tournament.placementTiers ?? []
    });
}

// Recompute and store the table. The stored row is the tournament's record of the places;
// the never-played are not in it (they have no place).
export async function recomputeStandings(tournamentId: string): Promise<PlayerStanding[]> {
    const rows = await getStandings(tournamentId);
    const placed = rows.filter((row) => row.place !== null);

    // A seat can name a user that does not exist — the record points at a real player.
    const real = await knownUsers(placed.map((row) => row.userId));
    const storable = placed.filter((row) => real.has(row.userId));

    await db.transaction(async (tx) => {
        await tx.delete(tournamentStandings).where(eq(tournamentStandings.tournamentId, tournamentId));
        if (storable.length > 0) {
            await tx.insert(tournamentStandings).values(storable.map((row) => ({
                tournamentId,
                userId: row.userId,
                rank: row.place!,
                placementPoints: row.placementPoints
            })));
        }
    });

    return rows;
}

// Which of these ids are real users.
async function knownUsers(userIds: string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const rows = await db.select({ id: users.id })
        .from(users)
        .where(inArray(users.id, userIds));
    return new Set(rows.map((row) => row.id));
}

// The names of the players in a list of ids — used by the portal.
export async function namesOf(userIds: string[]): Promise<Record<string, string>> {
    if (userIds.length === 0) return {};
    const rows = await db.select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, userIds));
    return Object.fromEntries(rows.map((row) => [row.id, row.displayName]));
}
