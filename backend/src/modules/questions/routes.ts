import type { FastifyInstance } from "fastify";
import { requireRole } from "../../lib/guards.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { users } from "../../db/schema/index.js";
import { QuestionError, toHttpStatus } from "./errors.js";
import {
    BatchEnvelope,
    CreateQuestionInput,
    EligibleListQuery,
    ListQuery,
    TransitionQuestionInput,
    UpdateQuestionInput
} from "./schemas.js";
import {
    createQuestion,
    getQuestion,
    importQuestions,
    listForAssembly,
    listQuestions,
    transitionQuestion,
    updateQuestion
} from "./service.js";
import type { QuestionKindValue } from "./payload.js";
import { auditFromRequest, type AuditAction } from "../audit/service.js";
import { requireSeason } from "../seasons/service.js";
import { canViewSeason } from "../../lib/season-access.js";
import type { ActorRole, QuestionStatusValue } from "./transitions.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const flatQuestionParams = {
    type: "object",
    required: ["questionId"],
    additionalProperties: false,
    properties: { questionId: { type: "string", pattern: UUID_PATTERN } },
} as const;


type SessionUser = typeof users.$inferSelect;


// The review gate is audited; content-only edits are not (doc volume rule).
const GATE_ACTIONS: Partial<Record<string, AuditAction>> = {
    PENDING: "question_submitted",
    PUBLISHED: "question_published",
    ARCHIVED: "question_archived"
};

async function auditGate(
    request: Parameters<typeof auditFromRequest>[0],
    question: { id: string; status: string; tag: string; kind: string }
): Promise<void> {
    const action = GATE_ACTIONS[question.status];
    if (!action) return;

    await auditFromRequest(request, action, {
        details: {
            questionId: question.id,
            tag: question.tag,
            kind: question.kind
        }
    });
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

    // ─── global bank ──────────────────────────────────────────────────────────

    app.post(
        "/portal/questions",
        { onRequest: staff, schema: { body: CreateQuestionInput } },
        async (request, reply) => {
            const user = request.sessionUser!;

            const row = await createQuestion(
                { actorId: user.id },
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
                { actorId: user.id },
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
                {
                    status: query.status,
                    kind: query.kind,
                    tag: query.tag,
                    search: query.search
                },
                parsePage(query)
            );
        }
    );

    // Browse what a season may assemble: the published questions of its own tags.
    app.get(
        "/portal/seasons/:seasonId/eligible-questions",
        {
            onRequest: staff,
            schema: {
                params: {
                    type: "object",
                    required: ["seasonId"],
                    additionalProperties: false,
                    properties: { seasonId: { type: "string", pattern: UUID_PATTERN } }
                },
                querystring: EligibleListQuery
            },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { seasonId } = request.params as { seasonId: string };

            const season = await requireSeason(seasonId).catch(() => {
                throw new QuestionError("NOT_FOUND", `season ${seasonId} not found`);
            });
            if (!canViewSeason(season, user)) {
                throw new QuestionError("NOT_FOUND", `season ${seasonId} not found`);
            }

            const query = request.query as EligibleListQuery;
            const kinds = query.kinds?.split(",") as QuestionKindValue[] | undefined;

            return listForAssembly(
                season.tags,
                { kinds, search: query.search },
                parsePage(query)
            );
        }
    );

    app.get(
        "/portal/questions/:questionId",
        { onRequest: staff, schema: { params: flatQuestionParams } },
        async (request) => {
            const { questionId } = request.params as { questionId: string };
            return getQuestion(questionId);
        }
    );

    app.patch(
        "/portal/questions/:questionId",
        { onRequest: staff, schema: { params: flatQuestionParams, body: UpdateQuestionInput } },
        async (request) => {
            const { questionId } = request.params as { questionId: string };

            await getQuestion(questionId);
            return updateQuestion(questionId, request.body as UpdateQuestionInput);
        }
    );

    app.patch(
        "/portal/questions/:questionId/status",
        { onRequest: staff, schema: { params: flatQuestionParams, body: TransitionQuestionInput } },
        async (request) => {
            const user = request.sessionUser!;
            const { questionId } = request.params as { questionId: string };

            await getQuestion(questionId);

            const { status } = request.body as TransitionQuestionInput;
            const question = await transitionQuestion(
                questionId,
                status as QuestionStatusValue,
                user.role as ActorRole
            );
            await auditGate(request, question);

            return question;
        }
    );

    app.delete(
        "/portal/questions/:questionId",
        { onRequest: staff, schema: { params: flatQuestionParams } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { questionId } = request.params as { questionId: string };

            await getQuestion(questionId);
            const archived = await transitionQuestion(
                questionId,
                "ARCHIVED",
                user.role as ActorRole
            );
            await auditGate(request, archived);

            return reply.code(204).send();
        }
    );
}
