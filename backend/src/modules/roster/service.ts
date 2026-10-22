// The season's roster: who may take a seat in a match. Admin-enrolled, free-form.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { seasonPlayers, users } from "../../db/schema/index.js";
import { SeasonError } from "../seasons/errors.js";

export async function enrollPlayers(seasonId: string, userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;

    await db.insert(seasonPlayers)
        .values(userIds.map((userId) => ({ seasonId, userId })))
        .onConflictDoNothing();

    return (await listEnrolled(seasonId)).length;
}

export async function listEnrolled(
    seasonId: string
): Promise<Array<{ userId: string; displayName: string; enrolledAt: Date }>> {
    return db
        .select({
            userId: seasonPlayers.userId,
            displayName: users.displayName,
            enrolledAt: seasonPlayers.enrolledAt
        })
        .from(seasonPlayers)
        .innerJoin(users, eq(users.id, seasonPlayers.userId))
        .where(eq(seasonPlayers.seasonId, seasonId));
}

// The players of a match, in seat order.
export async function requireEnrolled(
    seasonId: string,
    userIds: string[]
): Promise<string[]> {
    const roster = await listEnrolled(seasonId);
    const known = new Set(roster.map((row) => row.userId));
    const missing = userIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
        throw new SeasonError(
            "NOT_ENROLLED",
            "these players are not enrolled in this season",
            missing
        );
    }
    return userIds;
}
