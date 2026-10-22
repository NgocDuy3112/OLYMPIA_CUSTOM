import type { FastifyInstance } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { requireAuth } from "../../lib/guards.js";
import { auditFromRequest } from "../audit/service.js";
import { SubmittedAnswerValueSchema, type SubmittedAnswerValue } from "../../game/contracts/index.js";
import {
    matchParams,
    seasonErrorHandler,
    seasonGuards,
    seasonParams,
    UUID_PATTERN
} from "../season-shared.js";
import {
    closeQualificationMatch,
    createQualificationMatch,
    getQualificationForPlayer,
    getQualificationForStaff,
    submitQualificationAnswer
} from "./service.js";

// The staff address a qualification match by tournament, season and match id.
const qualificationMatchParams = {
    type: "object",
    required: ["tournamentId", "seasonId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        seasonId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const idList = {
    type: "array",
    items: { type: "string", pattern: UUID_PATTERN },
    minItems: 1
} as const;

export async function qualificationRoutes(app: FastifyInstance) {
    seasonErrorHandler(app);
    const { staff, assertWrite, assertView } = seasonGuards();

    // ── The staff's side ───────────────────────────────────────────────────────

    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/qualification-matches",
        {
            onRequest: staff,
            schema: {
                params: seasonParams,
                body: {
                    type: "object",
                    required: ["label", "scheduledAt", "questionCount"],
                    additionalProperties: false,
                    properties: {
                        label: { type: "string", minLength: 1 },
                        scheduledAt: { type: "string", minLength: 1 },
                        stageId: { type: "string", minLength: 1 },
                        questionCount: { type: "integer", minimum: 1, maximum: 200 },
                        playerIds: idList
                    }
                }
            }
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            const body = request.body as {
                label: string;
                scheduledAt: string;
                stageId?: string;
                questionCount: number;
                playerIds?: string[];
            };

            await assertWrite(tournamentId, seasonId, user.id, user.role);
            const match = await createQualificationMatch(tournamentId, seasonId, body);

            await auditFromRequest(request, "season_drawn", {
                details: { seasonId, kind: "qualification", matchId: match.id }
            });

            reply.code(201);
            return match;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/qualification-matches/:matchId",
        { onRequest: staff, schema: { params: qualificationMatchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string; seasonId: string; matchId: string;
            };

            await assertView(tournamentId, seasonId, user.id, user.role);
            return getQualificationForStaff(matchId);
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/qualification-matches/:matchId/close",
        {
            onRequest: staff,
            schema: {
                params: qualificationMatchParams,
                body: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        tieBreaks: {
                            type: "array",
                            items: {
                                type: "object",
                                required: ["players", "order"],
                                additionalProperties: false,
                                properties: { players: idList, order: idList }
                            }
                        }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId, matchId } = request.params as {
                tournamentId: string; seasonId: string; matchId: string;
            };
            const body = request.body as { tieBreaks?: Array<{ players: string[]; order: string[] }> } | undefined;

            await assertWrite(tournamentId, seasonId, user.id, user.role);
            const result = await closeQualificationMatch(matchId, { tieBreaks: body?.tieBreaks });

            await auditFromRequest(request, "season_closed", {
                details: { kind: "qualification", seasonId, matchId, order: result.rows }
            });

            return result;
        }
    );

    // ── The player's side ──────────────────────────────────────────────────────

    app.get(
        "/gameplay/matches/:matchId/qualification",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: { params: matchParams }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            return getQualificationForPlayer(matchId, user.id);
        }
    );

    app.post(
        "/gameplay/matches/:matchId/qualification/answers",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: {
                params: matchParams,
                body: {
                    type: "object",
                    required: ["questionId", "value"],
                    additionalProperties: false,
                    properties: {
                        questionId: { type: "string", pattern: UUID_PATTERN },
                        value: { type: "object" }
                    }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { matchId } = request.params as { matchId: string };
            const body = request.body as { questionId: string; value: unknown };

            if (!Value.Check(SubmittedAnswerValueSchema, body.value)) {
                throw app.httpErrors.badRequest("invalid answer value");
            }

            // The time is measured by the server. The client does not get a say in it.
            return submitQualificationAnswer({
                matchId,
                userId: user.id,
                questionId: body.questionId,
                value: body.value as SubmittedAnswerValue
            });
        }
    );
}
