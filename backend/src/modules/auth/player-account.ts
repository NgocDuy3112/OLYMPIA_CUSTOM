// A player's account: the handle they sign in with, and the one password that
// is theirs.
//
// Step 8 inverted who creates it. The DESK creates the account — username
// derived from the name it typed (`lib/username.ts`), first password typed by
// the operator — and that first password stops being the desk's the moment the
// player sets their own. `mustChangePassword` is the promise, and
// `lib/guards.ts` keeps it: every authenticated route except whoami, logout and
// change-password answers 409 PASSWORD_CHANGE_REQUIRED until it clears, so a
// password the operator knows works for exactly as long as the player hasn't
// shown up.
//
// Self-registration and the verification mail went with the old model (there is
// no mail flow left to verify an address with). Google sign-in stays a
// secondary door and vouches for its own address.
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
    // ── log in ────────────────────────────────────────────────────────────────
    // The same key staff use (username + password), without the TOTP step.
    // Handles are stored lower-case but SPEAKABLE, so the lookup folds case:
    // "Ngoc-Duy" and "ngoc-duy" are one player, not two.
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

            // One message for "unknown handle" and "wrong password": no enumeration.
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

            // The flag rides along so the client can go STRAIGHT to the change
            // form instead of waiting for the first request to bounce with 409.
            return {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                mustChangePassword: user.mustChangePassword,
            };
        }
    );

    // ── set my own password ──────────────────────────────────────────────────
    // The door the forced change walks through. `currentPassword` is required
    // when one exists (proof the caller is the player who just typed it), and
    // skipped for an account that has none yet — a Google-created player whose
    // session is the only proof there is.
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

            // Bumping the version kills every session the OLD password minted —
            // including any the desk opened while it still knew the password —
            // and the one below re-issues this browser's, so the player walks
            // straight into the app instead of back to the login form.
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

    // ── which match am I in? (what "Vào trận" opens) ──────────────────────────
    app.get(
        "/gameplay/me/match",
        { onRequest: [requireAuth("GAMEPLAY")] },
        async (request) => {
            const user = request.sessionUser!;

            // Seated, and still worth opening: UPCOMING (waiting room) or LIVE.
            // A seat is a jsonb array of { userId }, so containment asks the
            // database directly instead of loading every match.
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
