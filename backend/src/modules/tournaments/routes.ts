import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
import { toHttpStatus, TournamentError } from "./errors.js";
import { CreateTournamentInput, UpdateTournamentInput } from "./schemas.js";
import {
    createTournament,
    deleteTournament,
    getBySlug,
    getTournament,
    updateTournament
} from "./service.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const idParams = {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: { id: { type: "string", pattern: UUID_PATTERN } },
} as const;

const slugParams = {
    type: "object",
    required: ["slug"],
    additionalProperties: false,
    properties: { slug: { type: "string", minLength: 1, maxLength: 100 } },
} as const;


export async function tournamentRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, request, reply) => {
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

    // Create — staff surface. The creator becomes the owner.
    // Only ADMIN may mint PRIVATE tournaments.
    app.post(
        "/portal/tournaments",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { body: CreateTournamentInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const input = request.body as CreateTournamentInput;

            if (input.visibility === "PRIVATE" && user.role !== "ADMIN") {
                throw app.httpErrors.forbidden("Only an admin may create a private tournament");
            }

            const row = await createTournament(input, user.id);
            reply.code(201);
            return row;
        }
    );

    // Update — PUBLIC: owner or ADMIN. PRIVATE: ADMIN only (404 for other staff).
    app.patch(
        "/portal/tournaments/:id",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: idParams, body: UpdateTournamentInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { id } = request.params as { id: string };
            const patch = request.body as UpdateTournamentInput;

            const existing = await getTournament(id);

            if (existing.visibility === "PRIVATE" && user.role !== "ADMIN") {
                throw new TournamentError("NOT_FOUND", `tournament ${id} not found`);
            }
            if (patch.visibility === "PRIVATE" && user.role !== "ADMIN") {
                throw app.httpErrors.forbidden("Only an admin may make a tournament private");
            }
            if (!canWriteTournament(existing, user)) {
                throw app.httpErrors.forbidden(
                    "Only the owner or an admin may edit this tournament"
                );
            }

            return updateTournament(id, patch);
        }
    );

    // Soft delete — ADMIN only. Marks deleted_at; the row (and its slug) stays
    // until an admin purges it manually. Repeated/unknown id → 404.
    app.delete(
        "/portal/tournaments/:id",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: idParams },
        },
        async (request, reply) => {
            const { id } = request.params as { id: string };
            await deleteTournament(id);
            return reply.code(204).send();
        }
    );

    // Read by id — any portal staff session; PRIVATE restricted to ADMIN.
    app.get(
        "/portal/tournaments/:id",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN", "OPERATOR"])],
            schema: { params: idParams },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { id } = request.params as { id: string };

            const tournament = await getTournament(id);
            if (!canViewTournament(tournament, user)) {
                throw new TournamentError("NOT_FOUND", `tournament ${id} not found`);
            }
            return tournament;
        }
    );

    // Public read by slug — unauthenticated. PRIVATE reads as 404,
    // indistinguishable from a missing slug (slugs are not enumerable).
    app.get(
        "/tournaments/:slug",
        { schema: { params: slugParams } },
        async (request) => {
            const { slug } = request.params as { slug: string };

            const tournament = await getBySlug(slug);
            if (tournament.visibility === "PRIVATE") {
                throw new TournamentError("NOT_FOUND", `tournament "${slug}" not found`);
            }
            return tournament;
        }
    );
}
