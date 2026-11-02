// The tournament's roster: who may take a seat in a match. Admin-enrolled, free-form.
import { and, eq } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { tournamentPlayers, users } from "../../db/schema/index.js";
import { TournamentError } from "../tournaments/errors.js";
import { GROUP_SEATS } from "../../game/engine/scoring/group-stage.js";

export async function enrollPlayers(tournamentId: string, userIds: string[]): Promise<number> {
    if (userIds.length === 0) return 0;

    await db.insert(tournamentPlayers)
        .values(userIds.map((userId) => ({ tournamentId, userId })))
        .onConflictDoNothing();

    return (await listEnrolled(tournamentId)).length;
}

/** Which group a contestant banks for, or null while they are still to be drawn. */
export type GroupLabel = "A" | "B";

export async function listEnrolled(
    tournamentId: string
): Promise<Array<{ userId: string; displayName: string; group: GroupLabel | null; enrolledAt: Date }>> {
    return db
        .select({
            userId: tournamentPlayers.userId,
            displayName: users.displayName,
            group: tournamentPlayers.group,
            enrolledAt: tournamentPlayers.enrolledAt
        })
        .from(tournamentPlayers)
        .innerJoin(users, eq(users.id, tournamentPlayers.userId))
        .where(eq(tournamentPlayers.tournamentId, tournamentId));
}

/**
 * Place an enrolled contestant in a group (Nhóm A / Nhóm B), or clear it with
 * null. The group stage's tables are derived from this, so this IS the draw.
 * Only an enrolled player can be placed — the update matches nothing otherwise.
 */
export class GroupFullError extends Error {
    constructor(public readonly group: GroupLabel) {
        super(`Nhóm ${group} already holds ${GROUP_SEATS} contestants`);
        this.name = "GroupFullError";
    }
}

export async function assignGroup(
    tournamentId: string,
    userId: string,
    group: GroupLabel | null
): Promise<boolean> {
    // The board draws four seats per Nhóm, so a fifth contestant has no seat to
    // take. Checked here as well as in the UI: a PATCH must not out-fill a group.
    if (group !== null) {
        const seated = await db
            .select({ userId: tournamentPlayers.userId })
            .from(tournamentPlayers)
            .where(and(
                eq(tournamentPlayers.tournamentId, tournamentId),
                eq(tournamentPlayers.group, group)
            ));
        if (seated.length >= GROUP_SEATS && !seated.some((row) => row.userId === userId)) {
            throw new GroupFullError(group);
        }
    }

    const updated = await db
        .update(tournamentPlayers)
        .set({ group })
        .where(and(
            eq(tournamentPlayers.tournamentId, tournamentId),
            eq(tournamentPlayers.userId, userId)
        ))
        .returning({ userId: tournamentPlayers.userId });

    return updated.length > 0;
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
