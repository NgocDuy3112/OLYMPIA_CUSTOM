import type { FastifyInstance } from "fastify";
import { Value } from "@sinclair/typebox/value";
import { requireAuth, requireRole } from "../../lib/guards.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
import { getSeason } from "../seasons/service.js";
import { SubmittedAnswerValueSchema, type SubmittedAnswerValue } from "../../game/contracts/index.js";
import { auditFromRequest } from "../audit/service.js";
import { QualificationError, toHttpStatus } from "./errors.js";
import {
    closeQualification,
    enrollPlayers,
    getQualificationForPlayer,
    getQualificationForStaff,
    listEnrolled,
    setupQualification,
    submitQualificationAnswer
} from "./qualification.service.js";

const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const seasonParams = {
    type: "object",
    required: ["tournamentId", "seasonId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        seasonId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const seasonIdParams = {
    type: "object",
    required: ["seasonId"],
    additionalProperties: false,
    properties: { seasonId: { type: "string", pattern: UUID_PATTERN } }
} as const;

const idList = {
    type: "array",
    items: { type: "string", pattern: UUID_PATTERN },
    minItems: 1
} as const;

export async function progressionRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof QualificationError) {
            reply.code(toHttpStatus(error.code)).send({
                error: error.code,
                message: error.message,
                ...(error.details.length > 0 && { details: error.details })
            });
            return;
        }
        reply.send(error);
    });

    const staff = [requireRole("PORTAL", ["ADMIN", "OPERATOR"])];

    // Every staff route is scoped to the tournament, so ownership applies.
    async function assertWrite(tournamentId: string, seasonId: string, userId: string, role: string) {
        await getSeason(tournamentId, seasonId);
        const { requireParent } = await import("../seasons/service.js");
        const parent = await requireParent(tournamentId);
        if (!canWriteTournament(parent, { id: userId, role } as never)) {
            throw new QualificationError("FORBIDDEN", "only the owner or an admin may manage this season");
        }
    }

    async function assertView(tournamentId: string, seasonId: string, userId: string, role: string) {
        await getSeason(tournamentId, seasonId);
        const { requireParent } = await import("../seasons/service.js");
        const parent = await requireParent(tournamentId);
        if (!canViewTournament(parent, { id: userId, role } as never)) {
            throw new QualificationError("NOT_FOUND", "season not found");
        }
    }

    // ── Enrollment ────────────────────────────────────────────────────────────
    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/players",
        {
            onRequest: staff,
            schema: {
                params: seasonParams,
                body: {
                    type: "object",
                    required: ["userIds"],
                    additionalProperties: false,
                    properties: { userIds: idList }
                }
            }
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            const { userIds } = request.body as { userIds: string[] };

            await assertWrite(tournamentId, seasonId, user.id, user.role);
            const enrolled = await enrollPlayers(seasonId, userIds);
            return { enrolled };
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/players",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            await assertView(tournamentId, seasonId, user.id, user.role);
            return { items: await listEnrolled(seasonId) };
        }
    );

    // ── Qualification (staff) ─────────────────────────────────────────────────
    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/qualification/setup",
        {
            onRequest: staff,
            schema: {
                params: seasonParams,
                body: {
                    type: "object",
                    required: ["questionIds"],
                    additionalProperties: false,
                    properties: { questionIds: idList }
                }
            }
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            const { questionIds } = request.body as { questionIds: string[] };

            await assertWrite(tournamentId, seasonId, user.id, user.role);
            const questions = await setupQualification(seasonId, questionIds, tournamentId);
            reply.code(201);
            return { questions: questions.length };
        }
    );

    app.post(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/qualification/close",
        {
            onRequest: staff,
            schema: {
                params: seasonParams,
                body: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        secondaryScores: {
                            type: "object",
                            additionalProperties: { type: "number" }
                        },
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
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            const body = request.body as {
                secondaryScores?: Record<string, number>;
                tieBreaks?: Array<{ players: string[]; order: string[] }>;
            } | undefined;

            await assertWrite(tournamentId, seasonId, user.id, user.role);
            const result = await closeQualification(seasonId, {
                secondaryScores: body?.secondaryScores,
                tieBreaks: body?.tieBreaks
            });

            await auditFromRequest(request, "season_closed", {
                details: {
                    phase: "qualification",
                    seasonId,
                    advancing: result.advancing,
                    secondaryScores: body?.secondaryScores ?? {},
                    tieBreaks: body?.tieBreaks ?? []
                }
            });

            return result;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/seasons/:seasonId/qualification",
        { onRequest: staff, schema: { params: seasonParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, seasonId } = request.params as { tournamentId: string; seasonId: string };
            await assertView(tournamentId, seasonId, user.id, user.role);
            return getQualificationForStaff(seasonId);
        }
    );

    // ── Qualification (player) ────────────────────────────────────────────────
    app.get(
        "/gameplay/seasons/:seasonId/qualification",
        { onRequest: [requireAuth("GAMEPLAY")], schema: { params: seasonIdParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };
            return getQualificationForPlayer(seasonId, user.id);
        }
    );

    app.post(
        "/gameplay/seasons/:seasonId/qualification/answers",
        {
            onRequest: [requireAuth("GAMEPLAY")],
            schema: {
                params: seasonIdParams,
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
            const { seasonId } = request.params as { seasonId: string };
            const body = request.body as { questionId: string; value: unknown };

            if (!Value.Check(SubmittedAnswerValueSchema, body.value)) {
                throw app.httpErrors.badRequest("invalid answer value");
            }

            return submitQualificationAnswer({
                seasonId,
                userId: user.id,
                questionId: body.questionId,
                value: body.value as SubmittedAnswerValue
            });
        }
    );
}
