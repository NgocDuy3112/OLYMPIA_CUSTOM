import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { canViewTournament, canWriteTournament } from "../../lib/tournament-access.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { users } from "../../db/schema/index.js";
import { QuestionError, toHttpStatus } from "./errors.js";
import {
    BatchEnvelope,
    CreateQuestionInput,
    ListQuery,
    TransitionQuestionInput,
    UpdateQuestionInput
} from "./schemas.js";
import {
    createQuestion,
    getQuestion,
    importQuestions,
    listQuestions,
    requireTournament,
    transitionQuestion,
    updateQuestion
} from "./service.js";
import type { ActorRole, QuestionStatusValue } from "./transitions.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const tournamentParams = {
    type: "object",
    required: ["tournamentId"],
    additionalProperties: false,
    properties: { tournamentId: { type: "string", pattern: UUID_PATTERN } },
} as const;

const nestedQuestionParams = {
    type: "object",
    required: ["tournamentId", "questionId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        questionId: { type: "string", pattern: UUID_PATTERN },
    },
} as const;

const flatQuestionParams = {
    type: "object",
    required: ["questionId"],
    additionalProperties: false,
    properties: { questionId: { type: "string", pattern: UUID_PATTERN } },
} as const;


type SessionUser = typeof users.$inferSelect;
type ParentTournament = Awaited<ReturnType<typeof requireTournament>>;

function assertView(parent: ParentTournament, user: SessionUser, tournamentId: string): void {
    if (!canViewTournament(parent, user)) {
        throw new QuestionError("NOT_FOUND", `tournament ${tournamentId} not found`);
    }
}

function assertWrite(parent: ParentTournament, user: SessionUser): void {
    if (!canWriteTournament(parent, user)) {
        throw new QuestionError(
            "FORBIDDEN",
            "Only the owner or an admin may manage this tournament's questions"
        );
    }
}


export async function questionRoutes(app: FastifyInstance) {
    app.setErrorHandler((error, request, reply) => {
        if (error instanceof QuestionError) {
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

    // ─── tournament bank ──────────────────────────────────────────────────────

    app.post(
        "/portal/tournaments/:tournamentId/questions",
        {
            onRequest: staff,
            schema: { params: tournamentParams, body: CreateQuestionInput },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);
            assertWrite(parent, user);

            const row = await createQuestion(
                { tournamentId, actorId: user.id },
                request.body as CreateQuestionInput
            );
            reply.code(201);
            return row;
        }
    );

    // Batch import — dry run reports, commit is all-or-nothing.
    app.post(
        "/portal/tournaments/:tournamentId/questions/batch",
        {
            onRequest: staff,
            schema: { params: tournamentParams, body: BatchEnvelope },
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);
            assertWrite(parent, user);

            const { dryRun = false, questions } = request.body as BatchEnvelope;
            const report = await importQuestions(
                { tournamentId, actorId: user.id },
                questions,
                dryRun
            );

            if (!dryRun && report.errors.length > 0) reply.code(400);
            return report;
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/questions",
        { onRequest: staff, schema: { params: tournamentParams, querystring: ListQuery } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);

            const query = request.query as ListQuery;
            return listQuestions(
                { tournamentId, status: query.status, kind: query.kind, tag: query.tag },
                parsePage(query)
            );
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/questions/:questionId",
        { onRequest: staff, schema: { params: nestedQuestionParams } },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, questionId } = request.params as {
                tournamentId: string;
                questionId: string;
            };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);

            return getQuestion(questionId, { tournamentId });
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/questions/:questionId",
        {
            onRequest: staff,
            schema: { params: nestedQuestionParams, body: UpdateQuestionInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, questionId } = request.params as {
                tournamentId: string;
                questionId: string;
            };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);
            assertWrite(parent, user);

            await getQuestion(questionId, { tournamentId });
            return updateQuestion(questionId, request.body as UpdateQuestionInput);
        }
    );

    app.patch(
        "/portal/tournaments/:tournamentId/questions/:questionId/status",
        {
            onRequest: staff,
            schema: { params: nestedQuestionParams, body: TransitionQuestionInput },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId, questionId } = request.params as {
                tournamentId: string;
                questionId: string;
            };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);
            assertWrite(parent, user);

            await getQuestion(questionId, { tournamentId });

            const { status } = request.body as TransitionQuestionInput;
            return transitionQuestion(questionId, status as QuestionStatusValue, user.role as ActorRole);
        }
    );

    // DELETE is an alias for archiving — one-way, same permission as any other transition.
    app.delete(
        "/portal/tournaments/:tournamentId/questions/:questionId",
        { onRequest: staff, schema: { params: nestedQuestionParams } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { tournamentId, questionId } = request.params as {
                tournamentId: string;
                questionId: string;
            };

            const parent = await requireTournament(tournamentId);
            assertView(parent, user, tournamentId);
            assertWrite(parent, user);

            await getQuestion(questionId, { tournamentId });
            await transitionQuestion(questionId, "ARCHIVED", user.role as ActorRole);

            return reply.code(204).send();
        }
    );

    // ─── global bank ──────────────────────────────────────────────────────────

    app.post(
        "/portal/questions",
        { onRequest: staff, schema: { body: CreateQuestionInput } },
        async (request, reply) => {
            const user = request.sessionUser!;

            const row = await createQuestion(
                { tournamentId: null, actorId: user.id },
                request.body as CreateQuestionInput
            );
            reply.code(201);
            return row;
        }
    );

    app.post(
        "/portal/questions/batch",
        { onRequest: staff, schema: { body: BatchEnvelope } },
        async (request, reply) => {
            const user = request.sessionUser!;

            const { dryRun = false, questions } = request.body as BatchEnvelope;
            const report = await importQuestions(
                { tournamentId: null, actorId: user.id },
                questions,
                dryRun
            );

            if (!dryRun && report.errors.length > 0) reply.code(400);
            return report;
        }
    );

    app.get(
        "/portal/questions",
        { onRequest: staff, schema: { querystring: ListQuery } },
        async (request) => {
            const query = request.query as ListQuery;
            return listQuestions(
                { tournamentId: null, status: query.status, kind: query.kind, tag: query.tag },
                parsePage(query)
            );
        }
    );

    app.get(
        "/portal/questions/:questionId",
        { onRequest: staff, schema: { params: flatQuestionParams } },
        async (request) => {
            const { questionId } = request.params as { questionId: string };
            return getQuestion(questionId, { tournamentId: null });
        }
    );

    app.patch(
        "/portal/questions/:questionId",
        { onRequest: staff, schema: { params: flatQuestionParams, body: UpdateQuestionInput } },
        async (request) => {
            const { questionId } = request.params as { questionId: string };

            await getQuestion(questionId, { tournamentId: null });
            return updateQuestion(questionId, request.body as UpdateQuestionInput);
        }
    );

    app.patch(
        "/portal/questions/:questionId/status",
        { onRequest: staff, schema: { params: flatQuestionParams, body: TransitionQuestionInput } },
        async (request) => {
            const user = request.sessionUser!;
            const { questionId } = request.params as { questionId: string };

            await getQuestion(questionId, { tournamentId: null });

            const { status } = request.body as TransitionQuestionInput;
            return transitionQuestion(questionId, status as QuestionStatusValue, user.role as ActorRole);
        }
    );

    app.delete(
        "/portal/questions/:questionId",
        { onRequest: staff, schema: { params: flatQuestionParams } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { questionId } = request.params as { questionId: string };

            await getQuestion(questionId, { tournamentId: null });
            await transitionQuestion(questionId, "ARCHIVED", user.role as ActorRole);

            return reply.code(204).send();
        }
    );
}
