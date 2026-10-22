// Bits the tournament's own routes share: the error shape, the route params, and who may
// write to a tournament.
import type { FastifyInstance } from "fastify";
import { requireRole } from "../lib/guards.js";
import { canViewTournament, canWriteTournament } from "../lib/tournament-access.js";
import { TournamentError, toHttpStatus } from "./tournaments/errors.js";

export const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

export const tournamentParams = {
    type: "object",
    required: ["tournamentId"],
    additionalProperties: false,
    properties: { tournamentId: { type: "string", pattern: UUID_PATTERN } }
} as const;

export const matchParams = {
    type: "object",
    required: ["matchId"],
    additionalProperties: false,
    properties: { matchId: { type: "string", pattern: UUID_PATTERN } }
} as const;

export function tournamentErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error: unknown, _request, reply) => {
        if (error instanceof TournamentError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details })
            });
            return;
        }
        reply.send(error);
    });
}

// The staff of the portal.
export function tournamentGuards() {
    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    async function assertWrite(tournamentId: string, userId: string, role: string) {
        const { getTournament } = await import("./tournaments/service.js");
        const tournament = await getTournament(tournamentId);
        if (!canWriteTournament(tournament, { id: userId, role } as never)) {
            throw new TournamentError("FORBIDDEN", "only the owner or an admin may manage this tournament");
        }
        return tournament;
    }

    async function assertView(tournamentId: string, userId: string, role: string) {
        const { getTournament } = await import("./tournaments/service.js");
        const tournament = await getTournament(tournamentId);
        if (!canViewTournament(tournament, { id: userId, role } as never)) {
            throw new TournamentError("NOT_FOUND", "tournament not found");
        }
        return tournament;
    }

    return { staff, assertWrite, assertView };
}
