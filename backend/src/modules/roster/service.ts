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

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const PASSWORD_MIN = 8;

const noAccountYet = (email: string) =>
    `no account exists for ${email} yet — have the desk create them (or sign in with Google once), then enroll the address here`;

export async function enrollByEmail(
    tournamentId: string,
    rawEmail: string
): Promise<{ userId: string; displayName: string; email: string; group: GroupLabel | null }> {
    const email = rawEmail.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) {
        throw new TournamentError("VALIDATION", `"${rawEmail}" does not look like an email address`);
    }
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
            emailVerified: address !== null,
            passwordHash: await argon2.hash(input.password),
            mustChangePassword: true,
            tokenVersion: 0,
        })
        .returning({ id: users.id, displayName: users.displayName, username: users.username });

    await enrollPlayers(tournamentId, [user.id]);
    return { userId: user!.id, displayName: user!.displayName, username: user!.username, group: null };
}
export type GroupLabel = "A" | "B";

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

export async function listEnrolled(
    tournamentId: string
): Promise<Array<{
    userId: string;
    displayName: string;
    username: string;
    email: string | null;
    discordId: string | null;
    hasPassword: boolean;
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
            discordId: users.discordId,
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
        email: row.email && !row.email.endsWith(PLACEHOLDER_DOMAIN) ? row.email : null
    }));
}

const PLACEHOLDER_DOMAIN = "@players.invalid";

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
    email?: string | null;
    discordId?: string | null;
}

export async function updateContestant(
    tournamentId: string,
    userId: string,
    edit: ContestantEdit
): Promise<{ userId: string; displayName: string; email: string | null }> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }

    const patch: { displayName?: string; email?: string | null; discordId?: string | null } = {};

    if (edit.discordId !== undefined) {
        patch.discordId = edit.discordId?.trim() || null;
    }

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

export async function removeContestant(tournamentId: string, userId: string): Promise<void> {
    if (!(await enrolledRow(tournamentId, userId))) {
        throw new TournamentError("NOT_ENROLLED", "this player is not enrolled in the tournament");
    }

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

