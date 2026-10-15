import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { users, tournaments } from "../../db/schema/index.js";
import { SeasonError, toHttpStatus } from "./errors.js";
import { CreateSeasonInput, UpdateSeasonInput } from "./schemas.js";
import {
    createSeason,
    deleteSeason,
    getSeason,
    listSeasons,
    requireParent,
    updateSeason
} from "./service.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const tournamentParams = {
    type: "object",
    required: ["tournamentId"],
    additionalProperties: false,
    properties: { tournamentId: { type: "string", pattern: UUID_PATTERN } },
} as const;

const seasonParams = {
    type: "object",
    required: ["tournamentId", "seasonId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        seasonId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;


type SessionUser = typeof users.$inferSelect;
type ParentTournament = typeof tournaments.$inferSelect;

function canView(parent: ParentTournament, user: SessionUser): boolean {
    if (parent.visibility === "PUBLIC") return true;
    return user.role === "ADMIN";
}

function canWrite(parent: ParentTournament, user: SessionUser): boolean {
    if (user.role === "ADMIN") return true;
    return parent.visibility === "PUBLIC" && parent.ownerId === user.id;
}


export async function seasonRoutes(app: FastifyInstance) {
    // Scoped to this plugin; other modules keep their own handlers.
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof SeasonError) {
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

    // Create — parent PUBLIC: owner or ADMIN; parent PRIVATE: ADMIN (others 404).
    app.post(
        "/portal/tournaments/:tournamentId/seasons",
        {
            onRequest: staff,
            schema: { params: tournamentParams, body: CreateSeasonInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const parent = await requireParent(tournamentId);
            if (!canView(parent, user)) {
                throw new SeasonError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }
            if (!canWrite(parent, user)) {
                throw app.httpErrors.forbidden(
                    "Only the owner or an admin may manage this tournament's seasons"
                );
            }

            const row = await createSeason(
                tournamentId,
                request.body as CreateSeasonInput
            );
            reply.code(201);
            return row;
        }
    );

    // List — any portal staff; PRIVATE parent → ADMIN only.
    app.get(
        "/portal/tournaments/:tournamentId/seasons",
        { onRequest: staff, schema: { params: tournamentParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const parent = await requireParent(tournamentId);
            if (!canView(parent, user)) {
                throw new SeasonError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }

            return listSeasons(tournamentId);
        }
    );

    // Read one — same visibility rule; cross-parent id → 404 inside the service.
    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as {
                tournamentId: string;
                seasonId: string;
            };

            const parent = await requireParent(tournamentId);
            if (!canView(parent, user)) {
                throw new SeasonError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }

            return getSeason(tournamentId, seasonId);
        }
    );

    // Update — owner or ADMIN (PUBLIC), ADMIN (PRIVATE via view check above).
    app.patch(
        "/portal/tournaments/:tournamentId/seasons/:seasonId",
        {
            onRequest: staff,
            schema: { params: seasonParams, body: UpdateSeasonInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as {
                tournamentId: string;
                seasonId: string;
            };

            const parent = await requireParent(tournamentId);
            if (!canView(parent, user)) {
                throw new SeasonError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }
            if (!canWrite(parent, user)) {
                throw app.httpErrors.forbidden(
                    "Only the owner or an admin may manage this tournament's seasons"
                );
            }

            return updateSeason(
                tournamentId,
                seasonId,
                request.body as UpdateSeasonInput
            );
        }
    );

    // Soft delete — ADMIN only. Clears current so the partial unique index
    // never blocks a future promotion.
    app.delete(
        "/portal/tournaments/:tournamentId/seasons/:seasonId",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: seasonParams },
        },
        async (request, reply) => {
            const { tournamentId, seasonId } = request.params as {
                tournamentId: string;
                seasonId: string;
            };

            await deleteSeason(tournamentId, seasonId);
            return reply.code(204).send();
        }
    );
}
