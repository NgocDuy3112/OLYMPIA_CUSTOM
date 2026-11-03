// The tournament's roster: who may take a seat in a match. Admin-enrolled, free-form.
import { randomUUID } from "node:crypto";
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

/** A rough guard so a typo cannot become an account nobody can ever claim. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Create a contestant and enroll them in one step.
 *
 * Players have no password and no Google account by design (the PIN claim mints
 * their session), so the console needs a way to MAKE the identity a seat points
 * at. The display name is what every surface shows.
 *
 * EMAIL decides whether the identity can ever be theirs for good:
 *  · given → the row carries that address, so the player's own Google sign-in
 *    finds it (`provisionPlayer` matches by email) and ATTACHES to this very
 *    user. Their matches, answers and standings are already on it: nothing moves.
 *  · omitted → a `@players.invalid` placeholder, unique by construction and never
 *    mailed. A show-floor identity: it plays, it never signs in.
 *
 * An address that already belongs to somebody is refused, not merged: the honest
 * move is to enroll THAT account (`POST …/players`), so one person never ends up
 * as two rows — which is the same stats-splitting bug in another costume.
 */
export async function createContestant(
    tournamentId: string,
    displayName: string,
    email?: string
): Promise<{ userId: string; displayName: string; group: GroupLabel | null }> {
    const name = displayName.trim();
    if (name.length === 0) {
        throw new TournamentError("VALIDATION", "a contestant needs a display name");
    }

    // Two "An"s on one roster is an operator mistake, not a feature: the seats,
    // the rail and the verdicts are read by name on the projector.
    const roster = await listEnrolled(tournamentId);
    const taken = roster.some((row) => row.displayName.toLowerCase() === name.toLowerCase());
    if (taken) {
        throw new TournamentError(
            "CONFLICT",
            `"${name}" is already a contestant in this tournament`
        );
    }

    const address = email?.trim().toLowerCase() || null;
    if (address !== null && !EMAIL_SHAPE.test(address)) {
        throw new TournamentError("VALIDATION", `"${email}" does not look like an email address`);
    }

    if (address !== null) {
        const [existing] = await db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(eq(users.email, address))
            .limit(1);

        if (existing) {
            // The person is already somebody here. Hand the operator the identity
            // to enroll instead of silently creating a second row for them.
            throw new TournamentError(
                "CONFLICT",
                `${address} already belongs to ${existing.displayName} — enroll that account instead of creating a new one`,
                [existing.id, existing.displayName]
            );
        }
    }

    const [user] = await db
        .insert(users)
        .values({
            role: "PLAYER",
            displayName: name,
            // With an address the player can later claim this very row through
            // Google; without one this is a placeholder the schema requires for
            // the PLAYER role — never routed, never mailed.
            email: address ?? `player-${randomUUID()}@players.invalid`,
            tokenVersion: 0
        })
        .returning({ id: users.id, displayName: users.displayName });

    await enrollPlayers(tournamentId, [user.id]);
    return { userId: user.id, displayName: user.displayName, group: null };
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
export async function assignGroup(
    tournamentId: string,
    userId: string,
    group: GroupLabel | null
): Promise<boolean> {
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
