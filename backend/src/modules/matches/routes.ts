import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { MatchError, toHttpStatus } from "./errors.js";
import {
    AssembleMatchInput,
    CreateMatchInput,
    ListMatchesQuery,
    TransitionMatchInput,
    UpdateMatchInput
} from "./schemas.js";
import {
    assembleMatch,
    createMatch,
    deleteMatch,
    getMatch,
    listMatches,
    requireMatchScope,
    transitionMatch,
    updateMatch
} from "./service.js";
import type { MatchScope } from "./service.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const seasonParams = {
    type: "object",
    required: ["tournamentId", "seasonId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        seasonId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;

const matchParams = {
    type: "object",
    required: ["tournamentId", "seasonId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        seasonId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;


function assertView(scope: MatchScope, user: { role: string }, tournamentId: string): void {
    const viewable = canViewTournament(scope.tournament, user as never);
    if (!viewable) {
        throw new MatchError("NOT_FOUND", `tournament ${tournamentId} not found`);
    }
}

function assertWrite(scope: MatchScope, user: { role: string }): void {
    const writable = canWriteTournament(scope.tournament, user as never);
    if (!writable) {
        throw new MatchError(
            "FORBIDDEN",
            "Only the owner or an admin may manage this tournament's matches"
        );
    }
}


export async function matchRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof MatchError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details }),
            });
            return;
        }
        if (error instanceof PaginationError) {
            reply.code(400).send({ error: "VALIDATION", message: error.message });
            return;
        }
        reply.send(error);
    });

    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches",
        {
            onRequest: staff,
            schema: { params: seasonParams, body: CreateMatchInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as {
                tournamentId: string;
                seasonId: string;
            };

            const scope = await requireMatchScope(tournamentId, seasonId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            const row = await createMatch(
                tournamentId,
                seasonId,
                request.body as CreateMatchInput
            );
            reply.code(201);
            return row;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches",
        {
            onRequest: staff,
            schema: { params: seasonParams, querystring: ListMatchesQuery },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as {
                tournamentId: string;
                seasonId: string;
            };

            const scope = await requireMatchScope(tournamentId, seasonId);
            assertView(scope, user, tournamentId);

            const query = request.query as ListMatchesQuery;
            return listMatches(seasonId, { status: query.status }, parsePage(query));
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId",
        { onRequest: staff, schema: { params: matchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string;
                seasonId: string;
                matchId: string;
            };

            const scope = await requireMatchScope(tournamentId, seasonId);
            assertView(scope, user, tournamentId);

            return getMatch(seasonId, matchId);
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId",
        {
            onRequest: staff,
            schema: { params: matchParams, body: UpdateMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string;
                seasonId: string;
                matchId: string;
            };

            const scope = await requireMatchScope(tournamentId, seasonId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            await getMatch(seasonId, matchId);
            return updateMatch(seasonId, matchId, request.body as UpdateMatchInput);
        }
    );

    // Re-assembly while UPCOMING: replaces matches.questions[] entirely.
    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId/assemble",
        {
            onRequest: staff,
            schema: { params: matchParams, body: AssembleMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string;
                seasonId: string;
                matchId: string;
            };

            const scope = await requireMatchScope(tournamentId, seasonId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            await getMatch(seasonId, matchId);
            return assembleMatch(seasonId, matchId, request.body as AssembleMatchInput);
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId/status",
        {
            onRequest: staff,
            schema: { params: matchParams, body: TransitionMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string;
                seasonId: string;
                matchId: string;
            };

            const scope = await requireMatchScope(tournamentId, seasonId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            const { status } = request.body as TransitionMatchInput;
            return transitionMatch(seasonId, matchId, status);
        }
    );

    // Soft delete — ADMIN only, and only while the match is still UPCOMING.
    app.delete(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/matches/:matchId",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: matchParams },
        },
        async (request, reply) => {
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string;
                seasonId: string;
                matchId: string;
            };

            await requireMatchScope(tournamentId, seasonId);
            await deleteMatch(seasonId, matchId);

            return reply.code(204).send();
        }
    );
}
