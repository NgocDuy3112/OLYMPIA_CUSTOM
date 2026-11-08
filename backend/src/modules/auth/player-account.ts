import argon2 from "argon2";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/pool.js";
import { matches, tournaments, users } from "../../db/schema/index.js";
import { requireAuth } from "../../lib/guards.js";
import { setSessionCookie } from "../../lib/cookies.js";
import { signToken } from "../../lib/jwt.js";

const PASSWORD_MIN = 8;

const perIp = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export async function playerAccountRoutes(app: FastifyInstance) {
    app.post(
        "/gameplay/auth/login",
        {
            ...perIp,
            schema: {
                body: {
                    type: "object",
                    required: ["username", "password"],
                    additionalProperties: false,
                    properties: {
                        username: { type: "string", minLength: 1, maxLength: 50 },
                        password: { type: "string", minLength: 1, maxLength: 256 },
                    },
                },
            },
        },
        async (request, reply) => {
            const body = request.body as { username: string; password: string };
            const handle = body.username.trim().toLowerCase();

            const [user] = await db
                .select()
                .from(users)
                .where(sql`lower(${users.username}) = ${handle}`)
                .limit(1);

            const invalid = () =>
                app.httpErrors.unauthorized("Tên đăng nhập hoặc mật khẩu không đúng.");
            if (!user?.passwordHash) throw invalid();

            const ok = await argon2.verify(user.passwordHash, body.password);
            if (!ok) throw invalid();
            if (user.disabledAt) throw app.httpErrors.forbidden("Tài khoản đã bị khoá.");

            setSessionCookie(reply, "GAMEPLAY", signToken(app, "GAMEPLAY", {
                sub: user.id,
                role: user.role,
                tokenVersion: user.tokenVersion,
            }));

            return {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                mustChangePassword: user.mustChangePassword,
            };
        }
    );

    app.post(
        "/gameplay/auth/change-password",
        {
            ...perIp,
            onRequest: [requireAuth("GAMEPLAY")],
            schema: {
                body: {
                    type: "object",
                    required: ["newPassword"],
                    additionalProperties: false,
                    properties: {
                        currentPassword: { type: "string", minLength: 1, maxLength: 256 },
                        newPassword: { type: "string", minLength: PASSWORD_MIN, maxLength: 256 },
                    },
                },
            },
        },
        async (request, reply) => {
            const body = request.body as { currentPassword?: string; newPassword: string };
            const user = request.sessionUser!;

            if (body.newPassword.length < PASSWORD_MIN) {
                throw app.httpErrors.badRequest(`Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`);
            }
            if (user.passwordHash) {
                if (!body.currentPassword) {
                    throw app.httpErrors.badRequest("Hãy nhập mật khẩu hiện tại.");
                }
                const ok = await argon2.verify(user.passwordHash, body.currentPassword);
                if (!ok) throw app.httpErrors.unauthorized("Mật khẩu hiện tại không đúng.");
                if (body.currentPassword === body.newPassword) {
                    throw app.httpErrors.badRequest("Mật khẩu mới phải khác mật khẩu hiện tại.");
                }
            }

            const tokenVersion = user.tokenVersion + 1;
            await db
                .update(users)
                .set({
                    passwordHash: await argon2.hash(body.newPassword),
                    mustChangePassword: false,
                    tokenVersion,
                    updatedAt: new Date(),
                })
                .where(eq(users.id, user.id));

            setSessionCookie(reply, "GAMEPLAY", signToken(app, "GAMEPLAY", {
                sub: user.id,
                role: user.role,
                tokenVersion,
            }));

            return { ok: true as const, displayName: user.displayName };
        }
    );

    app.get(
        "/gameplay/me/match",
        { onRequest: [requireAuth("GAMEPLAY")] },
        async (request) => {
            const user = request.sessionUser!;

            const rows = await db
                .select({
                    matchId: matches.id,
                    label: matches.label,
                    status: matches.status,
                    scheduledAt: matches.scheduledAt,
                    slug: tournaments.slug,
                    tournamentName: tournaments.name,
                })
                .from(matches)
                .innerJoin(tournaments, eq(tournaments.id, matches.tournamentId))
                .where(
                    and(
                        or(eq(matches.status, "UPCOMING"), eq(matches.status, "LIVE")),
                        sql`${matches.players} @> ${JSON.stringify([{ userId: user.id }])}::jsonb`
                    )
                )
                .orderBy(desc(matches.scheduledAt))
                .limit(5);

            return { items: rows };
        }
    );
}
