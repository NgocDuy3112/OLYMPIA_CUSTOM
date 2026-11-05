// The tournament's roster: who may take a seat in a match. Admin-enrolled, free-form.
import argon2 from "argon2";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchStats, scoreAdjustments, tournamentPlayers, users } from "../../db/schema/index.js";
import { pickUsername } from "../../lib/username.js";
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

/** The same floor the old registration form had: a password is a password. */
const PASSWORD_MIN = 8;

/**
 * The 404 of enroll-by-email — one sentence, whatever the reason underneath:
 * with registration gone in step 8, an address nothing has ever produced has no
 * account behind it, and the DESK is what makes one (or Google, once).
 */
const noAccountYet = (email: string) =>
    `no account exists for ${email} yet — have the desk create them (or sign in with Google once), then enroll the address here`;

/**
 * Enroll an EXISTING account by its address — the operator never learns the
 * password, because there is none to learn: whoever holds it chose it (at the
 * desk, or at Google).
 *
 * This is the door for an account that EXISTS but is not on this roster yet:
 * one created for another tournament, or made by the player's first Google
 * sign-in (which matches on the address).
 *
 * The refusals are each a different mistake at the desk, and each one says
 * what to DO instead:
 *  · no account for that address → 404, pointing at what makes one;
 *  · a disabled account → 403, it cannot come back by itself;
 *  · already on this roster → 409, nothing to do.
 *
 * A `@players.invalid` placeholder answers the same 404: it is pre-step-8 data,
 * never an account.
 */
export async function enrollByEmail(
    tournamentId: string,
    rawEmail: string
): Promise<{ userId: string; displayName: string; email: string; group: GroupLabel | null }> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) {
        throw new TournamentError("VALIDATION", `"${rawEmail}" does not look like an email address`);
    }
    // A show-floor placeholder is pre-step-8 data, not an address anybody owns:
    // enrolling it would be the 404 below wearing a costume.
    if (email.endsWith(PLACEHOLDER_DOMAIN)) {
        throw new TournamentError("NOT_FOUND", noAccountYet(email));
    }

    const [user] = await db
        .select({
            id: users.id,
            displayName: users.displayName,
            email: users.email,
            role: users.role,
            disabledAt: users.disabledAt
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (!user || user.role !== "PLAYER") {
        throw new TournamentError("NOT_FOUND", noAccountYet(email));
    }
    if (user.disabledAt) {
        throw new TournamentError("FORBIDDEN", `${email} belongs to a disabled account`);
    }

    if (await enrolledRow(tournamentId, user.id)) {
        throw new TournamentError("CONFLICT", `${email} is already on this roster`);
    }

    await enrollPlayers(tournamentId, [user.id]);
    return { userId: user.id, displayName: user.displayName, email: user.email!, group: null };
}

/**
 * Create a contestant AND their account, in one step — the desk's only door.
 *
 * Step 8: the operator types the name and the FIRST PASSWORD, the server
 * derives the login handle from the name (`ngoc-duy`), and the row is born with
 * `mustChangePassword` — the desk's password stops being the desk's the moment
 * the player sets their own (enforced by `lib/guards.ts`, not by good
 * intentions). Enrolled in the same call, like always.
 *
 * EMAIL is optional and only ever means "this address is where Google sign-in
 * will find this same row" (`provisionPlayer` matches by email, so the player's
 * matches, answers and standings are already on it — nothing moves). An address
 * that already belongs to somebody is refused, not merged: the honest move is to
 * enroll THAT account, so one person never ends up as two rows — which is the
 * same stats-splitting bug in another costume.
 */
export async function createContestant(
    tournamentId: string,
    input: { displayName: string; password: string; email?: string }
): Promise<{ userId: string; displayName: string; username: string; group: GroupLabel | null }> {
    const name = input.displayName.trim();
    if (name.length === 0) {
        throw new TournamentError("VALIDATION", "a contestant needs a display name");
    }
    if (input.password.length < PASSWORD_MIN) {
        throw new TournamentError("VALIDATION", `a first password needs at least ${PASSWORD_MIN} characters`);
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

    const address = input.email?.trim().toLowerCase() || null;
    if (address !== null && !EMAIL_SHAPE.test(address)) {
        throw new TournamentError("VALIDATION", `"${input.email}" does not look like an email address`);
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

    const username = await pickUsername(db, name);
    const [user] = await db
        .insert(users)
        .values({
            role: "PLAYER",
            username,
            displayName: name,
            email: address,
            // The desk typed this address, so it is vouched for the way the old
            // «Xác thực» button vouched for it — there is no mail left to open.
            emailVerified: address !== null,
            passwordHash: await argon2.hash(input.password),
            mustChangePassword: true,
            tokenVersion: 0,
        })
        .returning({ id: users.id, displayName: users.displayName, username: users.username });

    await enrollPlayers(tournamentId, [user.id]);
    return { userId: user!.id, displayName: user!.displayName, username: user!.username, group: null };
}
/** Which group a contestant banks for, or null while they are still to be drawn. */
export type GroupLabel = "A" | "B";

/**
 * Set — or RESET — a contestant's password: the forgotten-password path, now
 * that the desk issues credentials itself.
 *
 * The operator types a first password again, and the row goes straight back to
 * `mustChangePassword`, so this password stops being the desk's at the player's
 * next sign-in exactly like the original one did. Bumping `tokenVersion` closes
 * the other half: every session the forgotten password ever minted dies here,
 * including any opened on a machine that is no longer theirs.
 *
 * This is also how a row from before step 8 (no password at all, nothing to
 * forget) is given a way in.
 */
export async function resetPassword(
    tournamentId: string,
    userId: string,
    password: string
): Promise<{ userId: string; username: string }> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }
    if (password.length < PASSWORD_MIN) {
        throw new TournamentError("VALIDATION", `a first password needs at least ${PASSWORD_MIN} characters`);
    }

    const [user] = await db
        .select({ id: users.id, username: users.username, disabledAt: users.disabledAt, tokenVersion: users.tokenVersion })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) throw new TournamentError("NOT_FOUND", "no such account");
    if (user.disabledAt) throw new TournamentError("FORBIDDEN", `${user.username} belongs to a disabled account`);

    await db
        .update(users)
        .set({
            passwordHash: await argon2.hash(password),
            mustChangePassword: true,
            tokenVersion: user.tokenVersion + 1,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));

    return { userId, username: user.username };
}

/**
 * The roster, as the console's players tab reads it.
 *
 * What the desk reads here now IS the account: the handle the player signs in
 * with, whether they have a password at all (rows created before step 8 never
 * got one), and whether they are still on the desk's first password. `email` is
 * null for a contestant who was never given an address — an address is only
 * where Google sign-in finds this row, never the identity.
 */
export async function listEnrolled(
    tournamentId: string
): Promise<Array<{
    userId: string;
    displayName: string;
    /** The login handle — what the desk tells this player to type. */
    username: string;
    email: string | null;
    /** No password at all (a row from before step 8): they cannot sign in yet. */
    hasPassword: boolean;
    /** Still on the desk's first password — theirs must be set before play. */
    mustChangePassword: boolean;
    group: GroupLabel | null;
    enrolledAt: Date;
}>> {
    const rows = await db
        .select({
            userId: tournamentPlayers.userId,
            displayName: users.displayName,
            username: users.username,
            email: users.email,
            hasPassword: sql<boolean>`${users.passwordHash} IS NOT NULL`,
            mustChangePassword: users.mustChangePassword,
            group: tournamentPlayers.group,
            enrolledAt: tournamentPlayers.enrolledAt
        })
        .from(tournamentPlayers)
        .innerJoin(users, eq(users.id, tournamentPlayers.userId))
        .where(eq(tournamentPlayers.tournamentId, tournamentId));

    return rows.map((row) => ({
        ...row,
        // A placeholder address is pre-step-8 data, never an identity: the
        // roster shows it as the absence it is.
        email: row.email && !row.email.endsWith(PLACEHOLDER_DOMAIN) ? row.email : null
    }));
}

const PLACEHOLDER_DOMAIN = "@players.invalid";

/** Is this contestant on the roster of this tournament? (edits are roster-scoped) */
async function enrolledRow(tournamentId: string, userId: string) {
    const [row] = await db
        .select({ userId: tournamentPlayers.userId, group: tournamentPlayers.group })
        .from(tournamentPlayers)
        .where(and(
            eq(tournamentPlayers.tournamentId, tournamentId),
            eq(tournamentPlayers.userId, userId)
        ))
        .limit(1);
    return row ?? null;
}

export interface ContestantEdit {
    displayName?: string;
    /** An address to attach (keeps their history claimable), or null to detach. */
    email?: string | null;
}

/**
 * Edit a contestant's name or address.
 *
 * The name and the address live on the USER row, not on the enrollment: a person
 * enrolled in two tournaments is one person with one name, and renaming them in
 * one place must not create a second identity (that is the same stats-splitting
 * trap as before, reached from the other side).
 */
export async function updateContestant(
    tournamentId: string,
    userId: string,
    edit: ContestantEdit
): Promise<{ userId: string; displayName: string; email: string | null }> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }

    const patch: { displayName?: string; email?: string | null } = {};

    if (edit.displayName !== undefined) {
        const name = edit.displayName.trim();
        if (name.length === 0) {
            throw new TournamentError("VALIDATION", "a contestant needs a display name");
        }
        const roster = await listEnrolled(tournamentId);
        const clash = roster.find(
            (row) => row.userId !== userId && row.displayName.toLowerCase() === name.toLowerCase()
        );
        if (clash) {
            throw new TournamentError("CONFLICT", `"${name}" is already a contestant in this tournament`);
        }
        patch.displayName = name;
    }

    if (edit.email !== undefined) {
        if (edit.email === null || edit.email.trim() === "") {
            // Detach: no address — Google sign-in stops finding this row, which
            // is the operator's call. The handle and password still work: an
            // address stopped being the identity in step 8.
            patch.email = null;
        } else {
            const address = edit.email.trim().toLowerCase();
            if (!EMAIL_SHAPE.test(address)) {
                throw new TournamentError("VALIDATION", `"${edit.email}" does not look like an email address`);
            }
            const [owner] = await db
                .select({ id: users.id, displayName: users.displayName })
                .from(users)
                .where(eq(users.email, address))
                .limit(1);
            if (owner && owner.id !== userId) {
                throw new TournamentError(
                    "CONFLICT",
                    `${address} already belongs to ${owner.displayName} — enroll that account instead of creating a new one`,
                    [owner.id, owner.displayName]
                );
            }
            patch.email = address;
        }
    }

    if (Object.keys(patch).length > 0) {
        await db.update(users).set({ ...patch, updatedAt: new Date() }).where(eq(users.id, userId));
    }

    const [row] = await db
        .select({ displayName: users.displayName, email: users.email })
        .from(users)
        .where(eq(users.id, userId));
    return {
        userId,
        displayName: row!.displayName,
        email: row!.email && !row!.email.endsWith(PLACEHOLDER_DOMAIN) ? row!.email : null
    };
}

/**
 * Take a contestant off the roster.
 *
 * Refused once they have played: their answers, per-match stats and score
 * adjustments are the record of the show. Unenrolling is for a mistake at the
 * desk — a wrong name, a person who never turned up — not for erasing results.
 */
export async function removeContestant(tournamentId: string, userId: string): Promise<void> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }

    // "Has this person done anything in this tournament?" — one question, one query.
    const [{ played }] = await db.execute<{ played: number }>(sql`
        select (
            (select count(*) from ${answers} a
                join matches m on m.id = a.match_id
                where m.tournament_id = ${tournamentId} and a.user_id = ${userId})
          + (select count(*) from ${matchStats} s
                where s.tournament_id = ${tournamentId} and s.user_id = ${userId})
          + (select count(*) from ${scoreAdjustments} adj
                join matches m2 on m2.id = adj.match_id
                where m2.tournament_id = ${tournamentId} and adj.user_id = ${userId})
        ) as played
    `).then((result) => result.rows as Array<{ played: number }>);

    if (Number(played) > 0) {
        throw new TournamentError(
            "CONFLICT",
            "this contestant has played in this tournament — their results are on the record",
            [String(played)]
        );
    }

    // A seat in an unfinished match still points at them: removing the roster entry
    // would leave a match that cannot start.
    const [{ seated }] = await db.execute<{ seated: number }>(sql`
        select count(*) as seated from matches m
        where m.tournament_id = ${tournamentId}
          and m.deleted_at is null
          and m.players @> ${JSON.stringify([{ userId }])}::jsonb
    `).then((result) => result.rows as Array<{ seated: number }>);

    if (Number(seated) > 0) {
        throw new TournamentError(
            "CONFLICT",
            "this contestant still holds a seat in a match — take them out of the match first"
        );
    }

    await db
        .delete(tournamentPlayers)
        .where(and(
            eq(tournamentPlayers.tournamentId, tournamentId),
            eq(tournamentPlayers.userId, userId)
        ));
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
