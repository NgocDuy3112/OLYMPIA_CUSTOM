import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { requireAuth, requireRole } from "../../lib/guards.js";
import { getMatchById, type MatchRow } from "../matches/service.js";
import { MatchError, toHttpStatus } from "../matches/errors.js";
import { isSeatedInMatch } from "../matches/seats.js";
import { isRtcConfigured, mintRtcToken, type RtcConfig, type RtcRole } from "./tokens.js";

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const matchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;

const matchIdParams = {
    type: "object",
    required: ["matchId"],
    additionalProperties: false,
    properties: { matchId: { type: "string", pattern: UUID_PATTERN } },
} as const;

// The viewer mint is the only unauthenticated route here — rate-limit it the
// way the other public surface does (gameplay-read), per IP.
const viewerRate = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

/**
 * Join tokens for the match's LiveKit room. Three doors, one mint:
 *
 * - POST /gameplay/matches/:matchId/rtc/token          session + seated  → player
 * - POST /portal/tournaments/…/matches/:matchId/…/token operator          → console
 * - POST /gameplay/matches/:matchId/rtc/viewer-token   no auth           → spectator
 *
 * The LiveKit JWT is minted LOCALLY (pure HMAC with LIVEKIT_API_SECRET, no
 * call to the SFU), after the route's guards have decided the role. All three
 * doors share two refusals: LiveKit un/partially configured → 503, and the
 * match not LIVE → 409 — the room exists exactly while the show does, so a
 * pre-show player warm-up happens in the LIVE match's pending stage, not
 * before the MC opens the match.
 */
export async function rtcRoutes(app: FastifyInstance) {
    // A mint naming a match that does not exist (or was deleted) must answer
    // 404, not 500 — the same mapping every other match-scoped module does.
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof MatchError) {
            reply.code(toHttpStatus(error.code)).send({ error: error.code, message: error.message });
            return;
        }
        reply.send(error);
    });

    const config = (): RtcConfig | null => {
        const candidate = {
            url: env.livekit.url,
            apiKey: env.livekit.apiKey,
            apiSecret: env.livekit.apiSecret,
        };
        return isRtcConfigured(candidate) ? candidate : null;
    };

    const mintFor = async (
        match: MatchRow,
        role: RtcRole,
        opts: { userId?: string; name?: string } = {}
    ) => {
        const rtc = config();
        if (!rtc) throw app.httpErrors.serviceUnavailable("rtc is not configured");
        if (match.status !== "LIVE") throw app.httpErrors.conflict("match is not LIVE");
        const token = await mintRtcToken(rtc, { room: match.id, role, ...opts });
        return { room: match.id, ...token };
    };

    // A seated player: publish-only in practice, but the grant allows subscribe.
    app.post(
        "/gameplay/matches/:matchId/rtc/token",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchIdParams },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };

            const match = await getMatchById(matchId);
            if (!isSeatedInMatch(match.players, user.id)) {
                throw app.httpErrors.forbidden("you are not a player in this match");
            }
            return mintFor(match, "player", { userId: user.id, name: user.displayName });
        }
    );

    // The MC console: subscribe-only, hidden from participant lists.
    app.post(
        "/portal/tournaments/:tournamentId/matches/:matchId/rtc/token",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: matchParams },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };

            const match = await getMatchById(matchId);
            return mintFor(match, "operator", { userId: user.id, name: user.displayName });
        }
    );

    // The public spectator link: subscribe-only, hidden, random identity per
    // viewer. Existence of the match is the only thing this reveals (a live
    // match's id is already shared to spectators by definition).
    app.post(
        "/gameplay/matches/:matchId/rtc/viewer-token",
        { ...viewerRate, schema: { params: matchIdParams } },
        async (request) => {
            const { matchId } = request.params as { matchId: string };
            const match = await getMatchById(matchId);
            return mintFor(match, "spectator");
        }
    );
}
