import type { FastifyInstance } from "fastify";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matches, tournaments } from "../../db/schema/index.js";
import { users } from "../../db/schema/auth.js";
import { setSessionCookie } from "../../lib/cookies.js";
import { signToken } from "../../lib/jwt.js";

// The player's way in — no account, no password (user decision):
//
//   POST /gameplay/join/lookup  {code}        → the match + its seat names
//   POST /gameplay/join/claim   {code,userId} → GAMEPLAY session for that seat
//
// Staff read the code off the match page; a player types it on /join, sees the
// seated names, taps their own, and lands in the player shell. The code is
// match-scoped: anyone holding it may claim any UNCLAIMED seat — accepted for
// a show floor (the MC watches who joins), and the seat list is the only thing
// the code ever reveals.
//
// Both endpoints are pre-session (the player may have no session at all), so
// both carry the login rate limit.

const lookupBody = {
    type: "object",
    required: ["code"],
    additionalProperties: false,
    properties: {
        code: { type: "string", minLength: 6, maxLength: 6 },
    },
} as const;

const claimBody = {
    type: "object",
    required: ["code", "userId"],
    additionalProperties: false,
    properties: {
        code: { type: "string", minLength: 6, maxLength: 6 },
        userId: { type: "string", pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$" },
    },
} as const;

const codeOf = (raw: string) => raw.trim().toUpperCase();

/** The match this code names — every code belongs to exactly one match. */
async function matchByCode(code: string) {
    const [row] = await db
        .select()
        .from(matches)
        .where(and(
            eq(matches.joinCode, code),
            eq(matches.kind, "STANDARD"),
            isNull(matches.deletedAt)
        ))
        .limit(1);
    return row ?? null;
}

/** The match's tournament slug — the player's deck lives under /s/:slug. */
async function slugOfMatch(match: { tournamentId: string }): Promise<string | null> {
    const [row] = await db
        .select({ slug: tournaments.slug })
        .from(tournaments)
        .where(eq(tournaments.id, match.tournamentId))
        .limit(1);
    return row?.slug ?? null;
}

export async function joinRoutes(app: FastifyInstance) {
    const perIp = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

    // Step 1: the code is right → who is seated (names only, ids are needed
    // for the claim and are harmless — the seat list is what the code buys).
    app.post(
        "/gameplay/join/lookup",
        { ...perIp, schema: { body: lookupBody } },
        async (request) => {
            const { code } = request.body as { code: string };
            const match = await matchByCode(codeOf(code));
            if (!match) throw app.httpErrors.notFound("Mã không đúng");

            const userIds = match.players
                .flatMap((seat) => (seat.kind === "user" && seat.userId ? [seat.userId] : []));
            const named = userIds.length === 0
                ? []
                : await db
                    .select({ id: users.id, displayName: users.displayName })
                    .from(users)
                    .where(inArray(users.id, userIds));

            return {
                matchId: match.id,
                slug: await slugOfMatch(match),
                label: match.label,
                status: match.status,
                seats: userIds.map((id) => ({
                    userId: id,
                    displayName: named.find((row) => row.id === id)?.displayName ?? "Thí sinh",
                })),
            };
        }
    );

    // Step 2: claim a seat → session cookie. The session is the same GAMEPLAY
    // token a password login would mint, so every seated-player route works
    // unchanged (session owns the user id; the body never does).
    app.post(
        "/gameplay/join/claim",
        { ...perIp, schema: { body: claimBody } },
        async (request, reply) => {
            const { code, userId } = request.body as { code: string; userId: string };
            const match = await matchByCode(codeOf(code));
            if (!match) throw app.httpErrors.notFound("Mã không đúng");

            const seated = match.players.some(
                (seat) => seat.kind === "user" && seat.userId === userId
            );
            if (!seated) throw app.httpErrors.forbidden("Người chơi không có trong trận này");

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);
            if (!user) throw app.httpErrors.notFound("Không tìm thấy thí sinh");
            if (user.disabledAt) throw app.httpErrors.forbidden("Tài khoản thí sinh đã bị khóa");

            const token = signToken(app, "GAMEPLAY", {
                sub: user.id,
                role: user.role,
                tokenVersion: user.tokenVersion,
            });
            setSessionCookie(reply, "GAMEPLAY", token);
            return { matchId: match.id, slug: await slugOfMatch(match), displayName: user.displayName };
        }
    );
}
