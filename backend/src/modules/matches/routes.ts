import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
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

const tournamentParams = {
    type: "object",
    required: ["tournamentId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;

const matchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
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
        "/portal/tournaments/:tournamentId/matches",
        {
            onRequest: staff,
            schema: { params: tournamentParams, body: CreateMatchInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            const row = await createMatch(
                tournamentId,
                request.body as CreateMatchInput
            );
            reply.code(201);
            return row;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/matches",
        {
            onRequest: staff,
            schema: { params: tournamentParams, querystring: ListMatchesQuery },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);

            const query = request.query as ListMatchesQuery;
            return listMatches(tournamentId, { status: query.status }, parsePage(query));
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/matches/:matchId",
        { onRequest: staff, schema: { params: matchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);

            return getMatch(tournamentId, matchId);
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/matches/:matchId/results",
        { onRequest: staff, schema: { params: matchParams, body: SetMatchResultsInput } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            const { totals } = request.body as SetMatchResultsInput;
            const match = await setMatchResults(tournamentId, matchId, totals);

            await auditFromRequest(request, "match_ended", {
                matchId: match.id,
                details: { tournamentId, manual: true, totals }
            });

            return match;
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/matches/:matchId",
        {
            onRequest: staff,
            schema: { params: matchParams, body: UpdateMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            await getMatch(tournamentId, matchId);
            return updateMatch(tournamentId, matchId, request.body as UpdateMatchInput);
        }
    );

    // Re-assembly while UPCOMING: replaces matches.questions[] entirely.
    app.post(
        "/portal/tournaments/:tournamentId/matches/:matchId/assemble",
        {
            onRequest: staff,
            schema: { params: matchParams, body: AssembleMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            await getMatch(tournamentId, matchId);
            return assembleMatch(tournamentId, matchId, request.body as AssembleMatchInput);
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/matches/:matchId/status",
        {
            onRequest: staff,
            schema: { params: matchParams, body: TransitionMatchInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            const scope = await requireMatchScope(tournamentId);
            assertView(scope, user, tournamentId);
            assertWrite(scope, user);

            const { status } = request.body as TransitionMatchInput;

            const previous = await getMatch(tournamentId, matchId);
            const match = await transitionMatch(tournamentId, matchId, status);

            // Only real transitions are audited; a same-status no-op is not an event.
            if (match.status !== previous.status) {
                const action = match.status === "LIVE" ? "match_started" : "match_ended";
                await auditFromRequest(request, action, {
                    matchId: match.id,
                    details: {
                        tournamentId,
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
        "/portal/tournaments/:tournamentId/matches/:matchId",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: matchParams },
        },
        async (request, reply) => {
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await requireMatchScope(tournamentId);
            await deleteMatch(tournamentId, matchId);

            return reply.code(204).send();
        }
    );
}
