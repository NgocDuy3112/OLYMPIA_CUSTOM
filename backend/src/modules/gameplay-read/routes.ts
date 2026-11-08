import type { FastifyInstance } from "fastify";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { TournamentError, toHttpStatus } from "../tournaments/errors.js";
import {
    PublicPageQuery,
    ScheduleResponse,
    StandingsResponse,
    TournamentListResponse,
    slugParams,
    PublicTournament,
} from "./schemas.js";
import {
    listPublicTournaments,
    publicSchedule,
    publicStandings,
    publicTournament
} from "./service.js";

const publicRate = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

export async function gameplayReadRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof PaginationError) {
            reply.code(400).send({ error: "VALIDATION", message: error.message });
            return;
        }
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

    app.get(
        "/gameplay/tournaments",
        {
            ...publicRate,
            schema: { response: { 200: TournamentListResponse } }
        },
        async () => ({ tournaments: await listPublicTournaments() })
    );

    app.get(
        "/gameplay/tournaments/:slug",
        {
            ...publicRate,
            schema: { params: slugParams, response: { 200: PublicTournament } }
        },
        async (request) => {
            const { slug } = request.params as { slug: string };
            return publicTournament(slug);
        }
    );

    app.get(
        "/gameplay/tournaments/:slug/matches",
        {
            ...publicRate,
            schema: { params: slugParams, querystring: PublicPageQuery, response: { 200: ScheduleResponse } }
        },
        async (request) => {
            const { slug } = request.params as { slug: string };
            return publicSchedule(slug, parsePage(request.query));
        }
    );

    app.get(
        "/gameplay/tournaments/:slug/standings",
        {
            ...publicRate,
            schema: { params: slugParams, response: { 200: StandingsResponse } }
        },
        async (request) => {
            const { slug } = request.params as { slug: string };
            return publicStandings(slug);
        }
    );
}
