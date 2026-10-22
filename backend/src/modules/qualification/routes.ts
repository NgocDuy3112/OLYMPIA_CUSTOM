import type { FastifyInstance } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { requireAuth } from "../../lib/guards.js";
import { auditFromRequest } from "../audit/service.js";
import { SubmittedAnswerValueSchema, type SubmittedAnswerValue } from "../../game/contracts/index.js";
import {
    matchParams,
    tournamentErrorHandler,
    tournamentGuards,
    tournamentParams,
    UUID_PATTERN
} from "../tournament-shared.js";
import {
    closeQualificationMatch,
    createQualificationMatch,
    getQualificationForPlayer,
    getQualificationForStaff,
    submitQualificationAnswer
} from "./service.js";

// The staff address a qualification match by tournament and match id.
const qualificationMatchParams = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const idList = {
    type: "array",
    items: { type: "string", pattern: UUID_PATTERN },
    minItems: 1
} as const;

export async function qualificationRoutes(app: FastifyInstance) {
    tournamentErrorHandler(app);
    const { staff, assertWrite, assertView } = tournamentGuards();

    // ── The staff's side ───────────────────────────────────────────────────────

    app.post(
        "/portal/tournaments/:tournamentId/qualification-matches",
        {
            onRequest: staff,
            schema: {
                params: tournamentParams,
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
            const { tournamentId } = request.params as { tournamentId: string };
            const body = request.body as {
                label: string;
                scheduledAt: string;
                stageId?: string;
                questionCount: number;
                playerIds?: string[];
            };

            await assertWrite(tournamentId, user.id, user.role);
            const match = await createQualificationMatch(tournamentId, body);

            await auditFromRequest(request, "tournament_drawn", {
                details: { tournamentId, kind: "qualification", matchId: match.id }
            });

            reply.code(201);
            return match;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/qualification-matches/:matchId",
        { onRequest: staff, schema: { params: qualificationMatchParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };

            await assertView(tournamentId, user.id, user.role);
            return getQualificationForStaff(matchId);
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/qualification-matches/:matchId/close",
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
            const { tournamentId, matchId } = request.params as { tournamentId: string; matchId: string };
            const body = request.body as { tieBreaks?: Array<{ players: string[]; order: string[] }> } | undefined;

            await assertWrite(tournamentId, user.id, user.role);
            const result = await closeQualificationMatch(matchId, { tieBreaks: body?.tieBreaks });

            await auditFromRequest(request, "tournament_closed", {
                details: { kind: "qualification", tournamentId, matchId, order: result.rows }
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
