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


    app.post(
        "/gameplay/join/claim",
        { ...perIp, onRequest: [requireAuth("GAMEPLAY")], schema: { body: codeBody } },
        async (request) => {
            const { code } = request.body as { code: string };
            const user = request.sessionUser!;

            const result = await claimSeat(user.id, code);

            await auditFromRequest(request, "tournament_updated", {
                matchId: result.matchId,
                details: { seatClaimed: user.id }
            });

            return result;
        }
    );


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

    app.post(
        "/portal/tournaments/:tournamentId/matches/:matchId/code",
        { onRequest: staff, schema: { params: matchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await assertWrite(tournamentId, user.id, user.role);
            const room = await rotateRoomCode(tournamentId, matchId, user.id);

            await auditFromRequest(request, "tournament_updated", {
                matchId,
                details: { tournamentId, roomCodeRotated: matchId, expiresAt: room.expiresAt.toISOString() }
            });

            return room;
        }
    );
}
