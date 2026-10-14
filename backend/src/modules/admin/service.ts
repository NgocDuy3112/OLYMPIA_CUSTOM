import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/pool.js";
import { users } from "../../db/schema/auth.js";
import { signInvite, verifyInvite } from "../../lib/jwt.js";

const MIN_PASSWORD_LENGTH = 12;

export async function createOperator(
    app: FastifyInstance,
    username: string,
    displayName: string | undefined
) {
    let user;
    try {
        [user] = await db
            .insert(users)
            .values({
                role: "OPERATOR",
                username,
                displayName: displayName ?? username,
            })
            .returning();
    } catch (error) {
        if (
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            (error as { code?: unknown }).code === "23505"
        ) {
            throw app.httpErrors.conflict("Username already taken");
        }
        throw error;
    }

    const inviteToken = signInvite(app, {
        sub: user!.id,
        tv: user!.tokenVersion,
        purpose: "invite",
    });

    return {
        operatorId: user!.id,
        username: user!.username,
        inviteToken,
    };
}

export async function acceptInvite(
    app: FastifyInstance,
    token: string,
    password: string
) {
    if (password.length < MIN_PASSWORD_LENGTH) {
        throw app.httpErrors.badRequest(
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
        );
    }

    let invite;
    try {
        invite = verifyInvite(app, token);
    } catch {
        throw app.httpErrors.badRequest("Invite link is invalid or expired");
    }
    if (invite.purpose !== "invite") {
        throw app.httpErrors.badRequest("Invite link is invalid");
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, invite.sub))
        .limit(1);

    if (!user || user.disabledAt) {
        throw app.httpErrors.badRequest("Invite link is invalid or expired");
    }
    if (user.tokenVersion !== invite.tv) {
        throw app.httpErrors.badRequest("Invite link is no longer valid");
    }
    if (user.passwordHash) {
        throw app.httpErrors.conflict("This invite has already been used");
    }

    const passwordHash = await argon2.hash(password);
    await db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));

    return { ok: true as const, username: user.username };
}