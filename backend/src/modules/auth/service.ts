import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/pool.js";
import { users } from "../../db/schema/auth.js";
import { signPending, signToken, verifyPending, type Surface } from "../../lib/jwt.js";
import { newTotpSecret, otpauthUri, verifyTotpCode } from "./totp.js";

export type LoginResult =
    | { state: "mfa"; pendingToken: string }
    | { state: "enroll"; pendingToken: string; otpauthUri: string };

export async function startLogin(
    app: FastifyInstance,
    surface: Surface,
    username: string,
    password: string
): Promise<LoginResult> {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

    // Same message whether the user is unknown or the password is wrong:
    // prevents username enumeration.
    const invalidCredentials = () => app.httpErrors.unauthorized("Invalid username or password");

    if (!user || !user.passwordHash) throw invalidCredentials();

    const passwordOk = await argon2.verify(user.passwordHash, password);
    if (!passwordOk) throw invalidCredentials();

    if (user.disabledAt) throw app.httpErrors.forbidden("Account disabled");

    const pendingToken = signPending(app, surface, { sub: user.id, purpose: "mfa" });

    if (!user.totpEnabledAt) {
        // First login (or interrupted enrollment): mint a fresh secret.
        const secret = newTotpSecret();
        await db
            .update(users)
            .set({ totpSecret: secret, updatedAt: new Date() })
            .where(eq(users.id, user.id));

        return {
            state: "enroll",
            pendingToken,
            otpauthUri: otpauthUri(secret, username),
        };
    }

    return { state: "mfa", pendingToken };
}


export async function finishMfa(
    app: FastifyInstance,
    surface: Surface,
    pendingToken: string,
    code: string
): Promise<string> {
    let pending;
    try {
        pending = verifyPending(app, surface, pendingToken);
    } catch {
        throw app.httpErrors.unauthorized("Login session expired, start again");
    }
    if (pending.purpose !== "mfa") {
        throw app.httpErrors.unauthorized("Invalid login session");
    }

    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, pending.sub))
        .limit(1);

    if (!user || !user.totpSecret) {
        throw app.httpErrors.unauthorized("Login session expired, start again");
    }
    if (user.disabledAt) throw app.httpErrors.forbidden("Account disabled");

    const step = await verifyTotpCode(user.totpSecret, code, user.totpLastUsedStep);
    if (step === null) throw app.httpErrors.unauthorized("Invalid or reused code");

    const now = new Date();
    await db
        .update(users)
        .set({
            totpLastUsedStep: step,
            ...(user.totpEnabledAt ? {} : { totpEnabledAt: now }),
            updatedAt: now,
        })
        .where(eq(users.id, user.id));

    return signToken(app, surface, {
        sub: user.id,
        role: user.role,
        tv: user.tokenVersion,
    });
}