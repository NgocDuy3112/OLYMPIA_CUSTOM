// The public read surface: what a spectator sees, with no session at all.
//
// Three reads under /gameplay/tournaments — the list, one tournament, its schedule and
// its standings. Every route is public, so every route is rate-limited per IP; the
// response schemas are strict, so nothing outside the allowlist is ever serialized.
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

// Anonymous reads: generous for a human, a wall for a scraper.
const publicRate = { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } };

export async function gameplayReadRoutes(app: FastifyInstance) {
    // The tournament error shape, plus the pagination errors the schedule produces.
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

    // The list: every public tournament, small.
    app.get(
        "/gameplay/tournaments",
        {
            ...publicRate,
            schema: { response: { 200: TournamentListResponse } }
        },
        async () => ({ tournaments: await listPublicTournaments() })
    );

    // One tournament: identity, stages, places, the points scale.
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

    // The schedule: matches with their stage, players and (when finished) results.
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

    // The standings: the places, by how far each player got.
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
