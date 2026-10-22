import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { canViewSeason, canWriteSeason } from "../../lib/season-access.js";
import { SeasonError, toHttpStatus } from "./errors.js";
import { seasonPlaces } from "../bracket/service.js";
import { scaleCoverage } from "../../game/engine/scoring/placement.js";
import { CreateSeasonInput, ListSeasonsQuery, UpdateSeasonInput } from "./schemas.js";
import {
    createSeason,
    deleteSeason,
    getSeason,
    listSeasons,
    requireSeason,
    updateSeason
} from "./service.js";


const seasonParams = {
    type: "object",
    required: ["seasonId"],
    additionalProperties: false,
    properties: { seasonId: { type: "string", pattern: "^[0-9a-f-]{36}$" } }
} as const;


export async function seasonRoutes(app: FastifyInstance) {
    // Scoped to this plugin; other modules keep their own handlers.
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof PaginationError) {
            reply.code(400).send({ error: "VALIDATION", message: error.message });
            return;
        }
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

    // Create — the creator owns it.
    app.post(
        "/portal/seasons",
        {
            onRequest: staff,
            schema: { body: CreateSeasonInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const row = await createSeason(user.id, request.body as CreateSeasonInput);
            reply.code(201);
            return row;
        }
    );

    // List — the seasons of the portal: the public ones, and the private ones of an admin.
    app.get(
        "/portal/seasons",
        {
            onRequest: staff,
            schema: { querystring: ListSeasonsQuery },
        },
        async (request) => {
            const user = request.sessionUser!;
            const query = request.query as ListSeasonsQuery;
            const current = query.current === undefined ? undefined : query.current === "true";
            const mine = query.mine === undefined ? undefined : query.mine === "true";

            return listSeasons({ current, mine, ownerId: user.id }, parsePage(query), {
                id: user.id,
                role: user.role
            });
        }
    );

    // Read one — PRIVATE → only an admin or the owner.
    app.get(
        "/portal/seasons/:seasonId",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            const season = await requireSeason(seasonId);
            if (!canViewSeason(season, user)) {
                throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
            }

            const places = await seasonPlaces(seasonId);
            return {
                ...season,
                places,
                points: scaleCoverage(season.placementTiers, places)
            };
        }
    );

    // Update — the owner or an admin.
    app.patch(
        "/portal/seasons/:seasonId",
        {
            onRequest: staff,
            schema: { params: seasonParams, body: UpdateSeasonInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            const season = await requireSeason(seasonId);
            if (!canViewSeason(season, user)) {
                throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
            }
            if (!canWriteSeason(season, user)) {
                throw app.httpErrors.forbidden(
                    "Only the owner or an admin may manage this season"
                );
            }

            return updateSeason(seasonId, request.body as UpdateSeasonInput);
        }
    );

    // Soft delete — ADMIN only. Clears current so the partial unique index
    // never blocks a future promotion.
    app.delete(
        "/portal/seasons/:seasonId",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: seasonParams },
        },
        async (request, reply) => {
            const { seasonId } = request.params as { seasonId: string };

            await deleteSeason(seasonId);
            return reply.code(204).send();
        }
    );
}
