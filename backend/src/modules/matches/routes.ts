import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { canViewSeason, canWriteSeason } from "../../lib/season-access.js";
import { auditFromRequest } from "../audit/service.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { MatchError, toHttpStatus } from "./errors.js";
import {
    AssembleMatchInput,
    CreateMatchInput,
    ListMatchesQuery,
    SetMatchResultsInput,
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
    setMatchResults,
    transitionMatch,
    updateMatch
} from "./service.js";
import type { MatchScope } from "./service.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const seasonParams = {
    type: "object",
    required: ["seasonId"],
    additionalProperties: false,
    properties: {
        seasonId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;

const matchParams = {
    type: "object",
    required: ["seasonId", "matchId"],
    additionalProperties: false,
    properties: {
        seasonId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;


function assertView(scope: MatchScope, user: { role: string }, seasonId: string): void {
    const viewable = canViewSeason(scope.season, user as never);
    if (!viewable) {
        throw new MatchError("NOT_FOUND", `season ${seasonId} not found`);
    }
}

function assertWrite(scope: MatchScope, user: { role: string }): void {
    const writable = canWriteSeason(scope.season, user as never);
    if (!writable) {
        throw new MatchError(
            "FORBIDDEN",
            "Only the owner or an admin may manage this season's matches"
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
        "/portal/seasons/:seasonId/matches",
        {
            onRequest: staff,
            schema: { params: seasonParams, body: CreateMatchInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);
            assertWrite(scope, user);

            const row = await createMatch(
                seasonId,
                request.body as CreateMatchInput
            );
            reply.code(201);
            return row;
        }
    );

    app.get(
        "/portal/seasons/:seasonId/matches",
        {
            onRequest: staff,
            schema: { params: seasonParams, querystring: ListMatchesQuery },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);

            const query = request.query as ListMatchesQuery;
            return listMatches(seasonId, { status: query.status }, parsePage(query));
        }
    );

    app.get(
        "/portal/seasons/:seasonId/matches/:matchId",
        { onRequest: staff, schema: { params: matchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId, matchId } = request.params as { seasonId: string; matchId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);

            return getMatch(seasonId, matchId);
        }
    );

    app.post(
        "/portal/seasons/:seasonId/matches/:matchId/results",
        { onRequest: staff, schema: { params: matchParams, body: SetMatchResultsInput } },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId, matchId } = request.params as { seasonId: string; matchId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);
            assertWrite(scope, user);

            const { totals } = request.body as SetMatchResultsInput;
            const match = await setMatchResults(seasonId, matchId, totals);

            await auditFromRequest(request, "match_ended", {
                matchId: match.id,
                details: { seasonId, manual: true, totals }
            });

            return match;
        }
    );

    app.patch(
        "/portal/seasons/:seasonId/matches/:matchId",
        {
            onRequest: staff,
            schema: { params: matchParams, body: UpdateMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId, matchId } = request.params as { seasonId: string; matchId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);
            assertWrite(scope, user);

            await getMatch(seasonId, matchId);
            return updateMatch(seasonId, matchId, request.body as UpdateMatchInput);
        }
    );

    // Re-assembly while UPCOMING: replaces matches.questions[] entirely.
    app.post(
        "/portal/seasons/:seasonId/matches/:matchId/assemble",
        {
            onRequest: staff,
            schema: { params: matchParams, body: AssembleMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId, matchId } = request.params as { seasonId: string; matchId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);
            assertWrite(scope, user);

            await getMatch(seasonId, matchId);
            return assembleMatch(seasonId, matchId, request.body as AssembleMatchInput);
        }
    );

    app.patch(
        "/portal/seasons/:seasonId/matches/:matchId/status",
        {
            onRequest: staff,
            schema: { params: matchParams, body: TransitionMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId, matchId } = request.params as { seasonId: string; matchId: string };

            const scope = await requireMatchScope(seasonId);
            assertView(scope, user, seasonId);
            assertWrite(scope, user);

            const { status } = request.body as TransitionMatchInput;

            const previous = await getMatch(seasonId, matchId);
            const match = await transitionMatch(seasonId, matchId, status);

            // Only real transitions are audited; a same-status no-op is not an event.
            if (match.status !== previous.status) {
                const action = match.status === "LIVE" ? "match_started" : "match_ended";
                await auditFromRequest(request, action, {
                    matchId: match.id,
                    details: {
                        seasonId,
                        from: previous.status,
                        to: match.status,
                        label: match.label
                    }
                });
            }

            return match;
        }
    );

    // Soft delete — ADMIN only, and only while the match is still UPCOMING.
    app.delete(
        "/portal/seasons/:seasonId/matches/:matchId",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: matchParams },
        },
        async (request, reply) => {
            const { seasonId, matchId } = request.params as { seasonId: string; matchId: string };

            await requireMatchScope(seasonId);
            await deleteMatch(seasonId, matchId);

            return reply.code(204).send();
        }
    );
}
