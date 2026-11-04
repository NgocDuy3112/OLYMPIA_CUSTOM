// The tournament's roster: who may take a seat in a match. Admin-enrolled, free-form.
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchStats, scoreAdjustments, tournamentPlayers, users } from "../../db/schema/index.js";
import { TournamentError } from "../tournaments/errors.js";
import { CodeError } from "../match-codes/errors.js";
import { issueEntryCode } from "../match-codes/service.js";

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
 * Enroll an EXISTING account by its address — the operator never learns the
 * password, because there is none to learn: the player registered it themselves.
 *
 * The refusals are each a different mistake at the desk, and each one says
 * what to DO instead:
 *  · nobody registered that address → 404, ask the player to register first;
 *  · a disabled account → 403, it cannot come back by itself;
 *  · already on this roster → 409, nothing to do.
 *
 * UNVERIFIED accounts are enrolled (step 7, decision 2): on a floor without
 * SMTP the player may never open the mail link, and refusing them here would
 * keep them OUT of the roster — which is exactly where the operator's
 * «Xác thực» button lives. The row lands unverified, the button is right
 * there, and only then can the player log in.
 *
 * A `@players.invalid` placeholder answers the same 404: nobody registered it.
 */
export async function enrollByEmail(
    tournamentId: string,
    rawEmail: string
): Promise<{ userId: string; displayName: string; email: string; group: GroupLabel | null }> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) {
        throw new TournamentError("VALIDATION", `"${rawEmail}" does not look like an email address`);
    }
    // A show-floor placeholder is a system-made address nobody ever registered:
    // enrolling it would be the 404 below wearing a costume.
    if (email.endsWith(PLACEHOLDER_DOMAIN)) {
        throw new TournamentError(
            "NOT_FOUND",
            `no contestant has registered with ${email} yet — ask them to register first, then enroll the address here`
        );
    }

    const [user] = await db
        .select({
            id: users.id,
            displayName: users.displayName,
            email: users.email,
            emailVerified: users.emailVerified,
            role: users.role,
            disabledAt: users.disabledAt
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

    if (!user || user.role !== "PLAYER") {
        throw new TournamentError(
            "NOT_FOUND",
            `no contestant has registered with ${email} yet — ask them to register first, then enroll the address here`
        );
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
 * ACTIVATE an account: the operator vouches for the address and sets
 * `emailVerified` themselves.
 *
 * This is the floor's answer to SMTP being optional — the desk can SEE the
 * account exists (the player registered it a minute ago), so the mail link is a
 * convenience rather than a gate. It is a TRUST action: the operator is asserting
 * the address is real, which is why the route audits it, and why it refuses a
 * show-floor identity (there is no account behind it to activate) and a disabled
 * one (activation would not un-disable it, and saying so beats a silent no-op).
 */
export async function activateAccount(
    tournamentId: string,
    userId: string
): Promise<{ userId: string; email: string; emailVerified: boolean }> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }

    const [user] = await db
        .select({ id: users.id, email: users.email, emailVerified: users.emailVerified, disabledAt: users.disabledAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) throw new TournamentError("NOT_FOUND", "no such account");
    if (!user.email || user.email.endsWith(PLACEHOLDER_DOMAIN)) {
        throw new TournamentError(
            "VALIDATION",
            "this is a show-floor identity with no account behind it — attach an email first"
        );
    }
    if (user.disabledAt) throw new TournamentError("FORBIDDEN", `${user.email} belongs to a disabled account`);

    if (!user.emailVerified) {
        await db
            .update(users)
            .set({ emailVerified: true, updatedAt: new Date() })
            .where(eq(users.id, userId));
    }

    return { userId, email: user.email, emailVerified: true };
}

/**
 * Issue this contestant's ONE-TIME entry code — the desk's answer to a
 * forgotten password, so the operator never holds (or resets) a password.
 *
 * The roster decides WHO may get one — enrolled here, with a real account
 * behind the row — and `match-codes` mints and expires it.
 */
export async function issueEntryCodeFor(
    tournamentId: string,
    userId: string,
    createdBy: string
): Promise<{ userId: string; email: string; code: string; expiresAt: Date }> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }

    const [user] = await db
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) throw new TournamentError("NOT_FOUND", "no such account");
    if (!user.email || user.email.endsWith(PLACEHOLDER_DOMAIN)) {
        throw new TournamentError(
            "VALIDATION",
            "this is a show-floor identity with no account to sign in to — attach an email first"
        );
    }

    // Disabled / unverified refusals live in match-codes: they are properties
    // of the ACCOUNT, not of this roster row. Their vocabulary is this
    // module's, so a refused code answers the roster's own error shape.
    try {
        const issued = await issueEntryCode(userId, createdBy);
        return { userId, email: user.email, ...issued };
    } catch (error) {
        if (error instanceof CodeError) {
            throw new TournamentError(error.code, error.message, error.details);
        }
        throw error;
    }
}

/**
 * Create a contestant and enroll them in one step.
 *
 * A contestant with no account is a show-floor identity: the console MAKES the
 * identity a seat points at, because they never registered one. The display name
 * is what every surface shows.
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

/**
 * The roster, as the console's players tab reads it.
 *
 * `email` is null for a show-floor identity (a `@players.invalid` placeholder):
 * the operator sees "no account", which is the truth that matters — that person
 * cannot sign in and claim their history.
 */
export async function listEnrolled(
    tournamentId: string
): Promise<Array<{
    userId: string;
    displayName: string;
    email: string | null;
    /** Has the player opened their mail link? The desk's «Xác thực» button acts on this. */
    emailVerified: boolean;
    group: GroupLabel | null;
    enrolledAt: Date;
}>> {
    const rows = await db
        .select({
            userId: tournamentPlayers.userId,
            displayName: users.displayName,
            email: users.email,
            emailVerified: users.emailVerified,
            group: tournamentPlayers.group,
            enrolledAt: tournamentPlayers.enrolledAt
        })
        .from(tournamentPlayers)
        .innerJoin(users, eq(users.id, tournamentPlayers.userId))
        .where(eq(tournamentPlayers.tournamentId, tournamentId));

    return rows.map((row) => ({
        ...row,
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

    const patch: { displayName?: string; email?: string } = {};

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
            // Detach: back to a show-floor identity that can never sign in.
            patch.email = `player-${randomUUID()}${PLACEHOLDER_DOMAIN}`;
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
