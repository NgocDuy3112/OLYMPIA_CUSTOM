import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
import { TournamentError, toHttpStatus } from "./errors.js";
import { tournamentPlaces } from "../bracket/service.js";
import { scaleCoverage } from "../../game/engine/scoring/placement.js";
import { CreateTournamentInput, ListTournamentsQuery, UpdateTournamentInput } from "./schemas.js";
import {
    createTournament,
    deleteTournament,
    getTournament,
    listTournaments,
    requireTournament,
    updateTournament
} from "./service.js";


const tournamentParams = {
    type: "object",
    required: ["tournamentId"],
    additionalProperties: false,
    properties: { tournamentId: { type: "string", pattern: "^[0-9a-f-]{36}$" } }
} as const;


export async function tournamentRoutes(app: FastifyInstance) {
    // Scoped to this plugin; other modules keep their own handlers.
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof PaginationError) {
            reply.code(400).send({ error: "VALIDATION", message: error.message });
            return;
        }
        if (error instanceof TournamentError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details }),
            });
            return;
        }
        reply.send(error);
    });

    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    // Create — the creator owns it.
    app.post(
        "/portal/tournaments",
        {
            onRequest: staff,
            schema: { body: CreateTournamentInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const row = await createTournament(user.id, request.body as CreateTournamentInput);
            reply.code(201);
            return row;
        }
    );

    // List — the tournaments of the portal: the public ones, and the private ones of an admin.
    app.get(
        "/portal/tournaments",
        {
            onRequest: staff,
            schema: { querystring: ListTournamentsQuery },
        },
        async (request) => {
            const user = request.sessionUser!;
            const query = request.query as ListTournamentsQuery;
            const current = query.current === undefined ? undefined : query.current === "true";
            const mine = query.mine === undefined ? undefined : query.mine === "true";

            return listTournaments({ current, mine, ownerId: user.id }, parsePage(query), {
                id: user.id,
                role: user.role
            });
        }
    );

    // Read one — PRIVATE → only an admin or the owner.
    app.get(
        "/portal/tournaments/:tournamentId",
        { onRequest: staff, schema: { params: tournamentParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const tournament = await requireTournament(tournamentId);
            if (!canViewTournament(tournament, user)) {
                throw new TournamentError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }

            const places = await tournamentPlaces(tournamentId);
            return {
                ...tournament,
                places,
                points: scaleCoverage(tournament.placementTiers, places)
            };
        }
    );

    // Update — the owner or an admin.
    app.patch(
        "/portal/tournaments/:tournamentId",
        {
            onRequest: staff,
            schema: { params: tournamentParams, body: UpdateTournamentInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const tournament = await requireTournament(tournamentId);
            if (!canViewTournament(tournament, user)) {
                throw new TournamentError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }
            if (!canWriteTournament(tournament, user)) {
                throw app.httpErrors.forbidden(
                    "Only the owner or an admin may manage this tournament"
                );
            }

            return updateTournament(tournamentId, request.body as UpdateTournamentInput);
        }
    );

    // Soft delete — ADMIN only. Clears current so the partial unique index
    // never blocks a future promotion.
    app.delete(
        "/portal/tournaments/:tournamentId",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: tournamentParams },
        },
        async (request, reply) => {
            const { tournamentId } = request.params as { tournamentId: string };

            await deleteTournament(tournamentId);
            return reply.code(204).send();
        }
    );
}
