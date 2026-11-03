// A player's OWN account: register, verify the address, log in.
//
// The identity is theirs, not the operator's: an email and a password the player
// chooses (nobody at the desk ever sees it), verified by a link before the account
// can be used. The operator's job becomes ENROLLING a known address, and seating
// that account — which is why the roster grew "enroll by email" beside "create a
// show-floor identity" (a contestant who never signs in).
//
// No secrets are stored beyond the argon2 hash, and the verification token is a
// 24-hour JWT with one purpose, so a leaked link cannot be replayed as a session.
import argon2 from "argon2";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../../db/pool.js";
import { matches, tournaments, users } from "../../db/schema/index.js";
import { requireAuth } from "../../lib/guards.js";
import { setSessionCookie } from "../../lib/cookies.js";
import { signToken, signVerifyEmail, verifyEmailToken } from "../../lib/jwt.js";
import { sendMail } from "../../lib/mailer.js";

const PASSWORD_MIN = 8;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const perIp = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

const normalizeEmail = (raw: string) => raw.trim().toLowerCase();

/** The absolute URL a link in a mail must carry — derived from the request. */
function originOf(request: { protocol: string; headers: Record<string, unknown> }): string {
    return `${request.protocol}://${request.headers.host}`;
}

export async function playerAccountRoutes(app: FastifyInstance) {
    // ── register ──────────────────────────────────────────────────────────────
    app.post(
        "/gameplay/auth/register",
        {
            ...perIp,
            schema: {
                body: {
                    type: "object",
                    required: ["email", "password"],
                    additionalProperties: false,
                    properties: {
                        email: { type: "string", maxLength: 255 },
                        password: { type: "string", minLength: PASSWORD_MIN, maxLength: 256 },
                        displayName: { type: "string", minLength: 1, maxLength: 100 },
                    },
                },
            },
        },
        async (request) => {
            const body = request.body as { email: string; password: string; displayName?: string };
            const email = normalizeEmail(body.email);

            if (!EMAIL_SHAPE.test(email)) throw app.httpErrors.badRequest("Địa chỉ email không hợp lệ.");
            if (body.password.length < PASSWORD_MIN) {
                throw app.httpErrors.badRequest(`Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`);
            }

            const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
            if (existing) throw app.httpErrors.conflict("Email này đã có tài khoản — hãy đăng nhập.");

            const displayName = (body.displayName ?? email.split("@")[0] ?? "Thí sinh").trim().slice(0, 100);
            const [created] = await db
                .insert(users)
                .values({
                    role: "PLAYER",
                    email,
                    displayName,
                    passwordHash: await argon2.hash(body.password),
                    // verified by the link below, never by the act of registering
                    emailVerified: false,
                    tokenVersion: 0,
                })
                .returning({ id: users.id });

            const link = `${originOf(request)}/gameplay/auth/verify?token=${encodeURIComponent(signVerifyEmail(app, created!.id))}`;
            await sendMail(request.log, {
                to: email,
                subject: "Xác thực tài khoản thi đấu Olympia Custom",
                text: [
                    `Chào ${displayName},`,
                    "",
                    "Bấm vào liên kết dưới đây để xác thực email và dùng được tài khoản (liên kết hết hạn sau 24 giờ):",
                    link,
                    "",
                    "Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.",
                ].join("\n"),
            });

            // 201 with no session: the account is not usable until the link is opened.
            return { pendingVerification: true, to: email };
        }
    );

    // ── verify (the link in the mail) ─────────────────────────────────────────
    app.get("/gameplay/auth/verify", async (request, reply) => {
        const { token } = request.query as { token?: string };
        const back = (query: string) => reply.redirect(`/login?${query}`);
        if (!token) return back("verify=invalid");

        let payload;
        try {
            payload = verifyEmailToken(app, token);
        } catch {
            return back("verify=expired");
        }
        if (payload.purpose !== "verify") return back("verify=invalid");

        await db
            .update(users)
            .set({ emailVerified: true, updatedAt: new Date() })
            .where(eq(users.id, payload.sub));

        return back("verify=ok");
    });

    // ── log in ────────────────────────────────────────────────────────────────
    app.post(
        "/gameplay/auth/login",
        {
            ...perIp,
            schema: {
                body: {
                    type: "object",
                    required: ["email", "password"],
                    additionalProperties: false,
                    properties: {
                        email: { type: "string", maxLength: 255 },
                        password: { type: "string", minLength: 1, maxLength: 256 },
                    },
                },
            },
        },
        async (request, reply) => {
            const body = request.body as { email: string; password: string };
            const email = normalizeEmail(body.email);

            const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
            // One message for "unknown address" and "wrong password": no enumeration.
            const invalid = () => app.httpErrors.unauthorized("Email hoặc mật khẩu không đúng.");
            if (!user?.passwordHash) throw invalid();

            const ok = await argon2.verify(user.passwordHash, body.password);
            if (!ok) throw invalid();
            if (user.disabledAt) throw app.httpErrors.forbidden("Tài khoản đã bị khoá.");
            if (!user.emailVerified) {
                throw app.httpErrors.forbidden(
                    "Email chưa được xác thực — mở liên kết trong email đăng ký rồi thử lại."
                );
            }

            setSessionCookie(reply, "GAMEPLAY", signToken(app, "GAMEPLAY", {
                sub: user.id,
                role: user.role,
                tokenVersion: user.tokenVersion,
            }));
            return { id: user.id, displayName: user.displayName, email: user.email };
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
