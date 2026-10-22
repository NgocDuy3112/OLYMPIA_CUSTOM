// The season's standings: a points table over the matches that were played for points.
//
// The points come from the match results, so the table is never typed in by hand: when a
// match ends, its points are added up and the ranking is recomputed. The bonus points by
// place come from the season's placement tiers.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchResults,
    matches,
    seasonStandings,
    seasons,
    users
} from "../../db/schema/index.js";
import type { PlacementTier, ResultEntry } from "../../game/contracts/index.js";

export interface StandingRow {
    userId: string;
    displayName: string;
    totalScore: number;
    matchesPlayed: number;
    rank: number;
    placementPoints: number;
}

// The bonus points for a place, from the season's tiers.
function pointsForPlace(tiers: PlacementTier[], rank: number): number {
    const tier = tiers.find((entry) => rank >= entry.min && rank <= entry.max);
    return tier?.points ?? 0;
}

// Recompute the table from the results of every points match in the season.
export async function recomputeStandings(seasonId: string): Promise<StandingRow[]> {
    const [season] = await db.select().from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!season) return [];

    const finished = await db
        .select({ results: matchResults.results })
        .from(matchResults)
        .innerJoin(matches, eq(matches.id, matchResults.matchId))
        .where(and(
            eq(matchResults.seasonId, seasonId),
            eq(matches.kind, "STANDARD"),
            isNull(matches.deletedAt)
        ));

    const totals = new Map<string, { score: number; played: number }>();
    for (const row of finished) {
        for (const entry of row.results as ResultEntry[]) {
            if (entry.kind !== "user" || !entry.userId) continue;
            const current = totals.get(entry.userId) ?? { score: 0, played: 0 };
            current.score += entry.totalScore;
            current.played += 1;
            totals.set(entry.userId, current);
        }
    }

    const userIds = [...totals.keys()];
    const names = new Map<string, string>();
    if (userIds.length > 0) {
        for (const row of await db.select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, userIds))) {
            names.set(row.id, row.displayName);
        }
    }

    const ranked = [...totals.entries()]
        .map(([userId, value]) => ({
            userId,
            displayName: names.get(userId) ?? userId,
            totalScore: value.score,
            matchesPlayed: value.played
        }))
        .sort((a, b) =>
            b.totalScore - a.totalScore
            || b.matchesPlayed - a.matchesPlayed
            || a.displayName.localeCompare(b.displayName));

    const rows: StandingRow[] = ranked.map((entry, index) => {
        const rank = index + 1;
        return {
            ...entry,
            rank,
            placementPoints: pointsForPlace(season.placementTiers ?? [], rank)
        };
    });

    await db.transaction(async (tx) => {
        await tx.delete(seasonStandings).where(eq(seasonStandings.seasonId, seasonId));
        if (rows.length > 0) {
            await tx.insert(seasonStandings).values(rows.map((row) => ({
                seasonId,
                userId: row.userId,
                totalScore: row.totalScore,
                rank: row.rank,
                placementPoints: row.placementPoints
            })));
        }
    });

    return rows;
}

// The table as it stands.
export async function getStandings(seasonId: string): Promise<StandingRow[]> {
    const rows = await db
        .select({
            userId: seasonStandings.userId,
            displayName: users.displayName,
            totalScore: seasonStandings.totalScore,
            rank: seasonStandings.rank,
            placementPoints: seasonStandings.placementPoints
        })
        .from(seasonStandings)
        .innerJoin(users, eq(users.id, seasonStandings.userId))
        .where(eq(seasonStandings.seasonId, seasonId))
        .orderBy(asc(seasonStandings.rank));

    const played = await playedCounts(seasonId);

    return rows.flatMap((row) => row.userId === null ? [] : [{
        ...row,
        userId: row.userId,
        matchesPlayed: played.get(row.userId) ?? 0
    }]);
}

// How many points matches each player has played in.
async function playedCounts(seasonId: string): Promise<Map<string, number>> {
    const finished = await db
        .select({ results: matchResults.results })
        .from(matchResults)
        .innerJoin(matches, eq(matches.id, matchResults.matchId))
        .where(and(
            eq(matchResults.seasonId, seasonId),
            eq(matches.kind, "STANDARD"),
            isNull(matches.deletedAt)
        ));

    const counts = new Map<string, number>();
    for (const row of finished) {
        for (const entry of row.results as ResultEntry[]) {
            if (entry.kind !== "user" || !entry.userId) continue;
            counts.set(entry.userId, (counts.get(entry.userId) ?? 0) + 1);
        }
    }
    return counts;
}
