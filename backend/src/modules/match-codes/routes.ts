// The door a ROOM CODE opens — and the one thing it never opens: an identity.
//
//   POST /gameplay/join/claim            session + room code  → a seat
//   GET  /portal/tournaments/:t/match-codes                   → the live codes
//   POST /portal/tournaments/:t/matches/:m/code               → mint / rotate
//
// The claim is AUTHENTICATED, which is the whole inversion of the PIN door
// deleted in step 5: that one minted a session from the code (code = identity),
// this one requires the session and uses the code only to say WHICH room is
// open. Identity is never chosen at the door, and `matchId`/seat semantics are
// untouched — a seat still references `user.id`.
import type { FastifyInstance } from "fastify";
import { requireAuth } from "../../lib/guards.js";
import { auditFromRequest } from "../audit/service.js";
import {
    tournamentGuards,
    tournamentParams,
    UUID_PATTERN
} from "../tournament-shared.js";
import { TournamentError, toHttpStatus as tournamentStatus } from "../tournaments/errors.js";
import { CodeError, toHttpStatus } from "./errors.js";
import {
    activeRoomCodes,
    claimSeat,
    rotateRoomCode
} from "./service.js";

const codeBody = {
    type: "object",
    required: ["code"],
    additionalProperties: false,
    properties: {
        // Normalised server-side (trimmed, upper-cased): the length check would
        // only tell a prober what shape the secret has.
        code: { type: "string", minLength: 1, maxLength: 32 }
    }
} as const;

const matchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const perIp = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

export async function matchCodeRoutes(app: FastifyInstance) {
    // Both error vocabularies this module can raise: a refused code (CodeError)
    // and a refused tournament write (the portal guards). Anything else keeps
    // Fastify's own handling.
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof CodeError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details })
            });
            return;
        }
        if (error instanceof TournamentError) {
            reply.code(tournamentStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details })
            });
            return;
        }
        reply.send(error);
    });

    const { staff, assertWrite } = tournamentGuards();

    // ── the player's half ────────────────────────────────────────────────────

    // Session + code + a free seat → seated. 401 without a session, 404 for an
    // unknown or expired code, 409 for a full table.
    app.post(
        "/gameplay/join/claim",
        { ...perIp, onRequest: [requireAuth("GAMEPLAY")], schema: { body: codeBody } },
        async (request) => {
            const { code } = request.body as { code: string };
            const user = request.sessionUser!;

            const result = await claimSeat(user.id, code);

            // Who walked in, on the record — the code is a bearer secret, so the
            // desk can see exactly which seat it bought. The value itself is
            // never written down.
            await auditFromRequest(request, "tournament_updated", {
                matchId: result.matchId,
                details: { seatClaimed: user.id }
            });

            return result;
        }
    );

    // ── the desk's half ──────────────────────────────────────────────────────

    // Every live room code of the tournament, in one read for the matches tab.
    //
    // WRITE-guarded, not view-guarded: a room code is a bearer secret that
    // seats people, and `canViewTournament` says yes to every staff member for
    // a PUBLIC tournament. The desk that RUNS this tournament reads the code;
    // other staff see the matches without the key to them.
    app.get(
        "/portal/tournaments/:tournamentId/match-codes",
        { onRequest: staff, schema: { params: tournamentParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            await assertWrite(tournamentId, user.id, user.role);
            return { items: await activeRoomCodes(tournamentId) };
        }
    );

    // Mint, or ROTATE: the old code stops working in the same transaction. A
    // leaked code is fixed here without touching a seat or an account.
    app.post(
        "/portal/tournaments/:tournamentId/matches/:matchId/code",
        { onRequest: staff, schema: { params: matchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await assertWrite(tournamentId, user.id, user.role);
            // The tournament is part of the lookup: an operator must not be able
            // to rotate another desk's match by pairing their own tournament id
            // with a match id they saw somewhere.
            const room = await rotateRoomCode(tournamentId, matchId, user.id);

            // The code itself is a secret: the trail records the rotation, never
            // the value that was handed out.
            await auditFromRequest(request, "tournament_updated", {
                matchId,
                details: { tournamentId, roomCodeRotated: matchId, expiresAt: room.expiresAt.toISOString() }
            });

            return room;
        }
    );
}
