// The tournament's roster: who may take a seat in a match. Admin-enrolled, free-form.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { tournamentPlayers, users } from "../../db/schema/index.js";
import { TournamentError } from "../tournaments/errors.js";

export async function enrollPlayers(tournamentId: string, userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;

    await db.insert(tournamentPlayers)
        .values(userIds.map((userId) => ({ tournamentId, userId })))
        .onConflictDoNothing();

    return (await listEnrolled(tournamentId)).length;
}

export async function listEnrolled(
    tournamentId: string
): Promise<Array<{ userId: string; displayName: string; enrolledAt: Date }>> {
    return db
        .select({
            userId: tournamentPlayers.userId,
            displayName: users.displayName,
            enrolledAt: tournamentPlayers.enrolledAt
        })
        .from(tournamentPlayers)
        .innerJoin(users, eq(users.id, tournamentPlayers.userId))
        .where(eq(tournamentPlayers.tournamentId, tournamentId));
}

// The players of a match, in seat order.
export async function requireEnrolled(
    tournamentId: string,
    userIds: string[]
): Promise<string[]> {
    const roster = await listEnrolled(tournamentId);
    const known = new Set(roster.map((row) => row.userId));
    const missing = userIds.filter((id) => !known.has(id));
    if (missing.length > 0) {
        throw new TournamentError(
            "NOT_ENROLLED",
            "these players are not enrolled in this tournament",
            missing
        );
    }
    return userIds;
}
