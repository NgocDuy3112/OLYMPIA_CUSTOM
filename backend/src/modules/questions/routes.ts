import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireRole } from "../../lib/guards.js";
import type { MediaAttachment } from "../../lib/media.js";
import { PaginationError, parsePage } from "../../lib/pagination.js";
import { users } from "../../db/schema/index.js";
import { QuestionError, toHttpStatus } from "./errors.js";
import {
    BatchEnvelope,
    BucketCountsQuery,
    CreateQuestionInput,
    EligibleListQuery,
    ListQuery,
    MAX_PAGE_SIZE,
    TransitionQuestionInput,
    UpdateQuestionInput
} from "./schemas.js";
import {
    bucketCounts,
    createQuestion,
    duplicateQuestion,
    getQuestion,
    importQuestions,
    listForAssembly,
    listQuestions,
    questionUsage,
    transitionQuestion,
    updateQuestion
} from "./service.js";
import { EXCEL_MAX_BYTES, MEDIA_MAX_BYTES, importExcel } from "./excel.js";
import {
    activeBatch,
    addRow,
    commitBatch,
    commitBatchToMatch,
    discardBatch,
    listBatches,
    listRows,
    updateRow,
    type RowPatch
} from "./staging.js";
import type { SourceCells } from "../../db/schema/index.js";
import type { QuestionKindValue } from "./payload.js";
import { auditFromRequest, type AuditAction } from "../audit/service.js";
import { requireTournament } from "../tournaments/service.js";
import { canViewTournament } from "../../lib/tournament-access.js";
import type { ActorRole, QuestionStatusValue } from "./transitions.js";


const UUID_PATTERN = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";

const flatQuestionParams = {
    type: "object",
    required: ["questionId"],
    additionalProperties: false,
    properties: { questionId: { type: "string", pattern: UUID_PATTERN } },
} as const;

const XLSX_CONTENT_TYPES = [
    "application/octet-stream",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
];

const excelQuery = {
    type: "object",
    additionalProperties: false,
    properties: { dryRun: { type: "string", pattern: "^(true|false|1|0)$" } }
} as const;

const importParams = {
    type: "object",
    required: ["batchId"],
    additionalProperties: false,
    properties: { batchId: { type: "string", pattern: UUID_PATTERN } }
} as const;

const importRowParams = {
    type: "object",
    required: ["batchId", "rowId"],
    additionalProperties: false,
    properties: {
        batchId: { type: "string", pattern: UUID_PATTERN },
        rowId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;

const cellsObject = {
    type: "object",
    additionalProperties: false,
    properties: {
        question: { type: "string" },
        answer: { type: "string" },
        explanation: { type: "string" },
        note: { type: "string" },
        media: { type: "string" }
    }
} as const;

const rowPatchBody = {
    type: "object",
    additionalProperties: false,
    properties: { cells: cellsObject, dropped: { type: "boolean" } }
} as const;

const addRowBody = {
    type: "object",
    required: ["sheet", "sourceId", "cells"],
    additionalProperties: false,
    properties: {
        sheet: { type: "string", enum: ["KHOI_DONG", "GIAI_MA", "BUT_PHA", "VE_DICH"] },
        sourceId: { type: "string", minLength: 1, maxLength: 64 },
        cells: cellsObject
    }
} as const;

const commitTargetBody = {
    type: "object",
    required: ["tournamentId", "matchId"],
    additionalProperties: false,
    properties: {
        tournamentId: { type: "string", pattern: UUID_PATTERN },
        matchId: { type: "string", pattern: UUID_PATTERN }
    }
} as const;


type SessionUser = typeof users.$inferSelect;


const GATE_ACTIONS: Partial<Record<string, AuditAction>> = {
    PENDING: "question_submitted",
    PUBLISHED: "question_published",
    ARCHIVED: "question_archived"
};

async function auditGate(
    request: Parameters<typeof auditFromRequest>[0],
    question: { id: string; status: string; kind: string }
): Promise<void> {
    const action = GATE_ACTIONS[question.status];
    if (!action) return;

    await auditFromRequest(request, action, {
        details: {
            questionId: question.id,
            kind: question.kind
        }
    });
}


interface ExcelUpload {
    workbook: Buffer;
    sourceName?: string;
    attachments: MediaAttachment[];
}

async function readExcelUpload(request: FastifyRequest): Promise<ExcelUpload> {
    if (!request.isMultipart()) {
        return { workbook: request.body as Buffer, attachments: [] };
    }

    let workbook: Buffer | undefined;
    let sourceName: string | undefined;
    const attachments: MediaAttachment[] = [];

    for await (const part of request.parts()) {
        if (part.type !== "file" || !part.filename) continue;
        const content = await part.toBuffer();
        if (part.fieldname === "file") {
            workbook = content;
            sourceName = part.filename;
        } else {
            attachments.push({ filename: part.filename, contentType: part.mimetype, content });
        }
    }

    if (!workbook) {
        throw new QuestionError("VALIDATION", 'the upload needs the workbook as its "file" field', [
            `${attachments.length} media file(s) received`
        ]);
    }
    return { workbook, sourceName, attachments };
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

    app.addContentTypeParser(XLSX_CONTENT_TYPES, { parseAs: "buffer" }, (_request, body, done) => {
        done(null, body);
    });


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

    app.post(
        "/portal/questions/import-excel",
        { onRequest: staff, bodyLimit: MEDIA_MAX_BYTES, schema: { querystring: excelQuery } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { dryRun } = request.query as { dryRun?: string };
            const { workbook, sourceName, attachments } = await readExcelUpload(request);

            if (workbook.length === 0) {
                throw new QuestionError("VALIDATION", "the upload must carry the .xlsx file itself");
            }
            if (workbook.length > EXCEL_MAX_BYTES) {
                throw new QuestionError("VALIDATION", "the workbook may be at most 5 MB", [
                    `${(workbook.length / (1024 * 1024)).toFixed(1)} MB`
                ]);
            }

            const report = await importExcel(
                { actorId: user.id },
                workbook,
                dryRun === "true" || dryRun === "1",
                attachments,
                { sourceName }
            );

            if (!report.dryRun && report.errors.length > 0 && !report.stagedBatchId) {
                reply.code(400);
            }
            return report;
        }
    );


    app.get(
        "/portal/question-imports",
        { onRequest: staff },
        async () => ({ active: await activeBatch(), batches: await listBatches() })
    );

    app.get(
        "/portal/question-imports/:batchId/rows",
        { onRequest: staff, schema: { params: importParams } },
        async (request) => {
            const { batchId } = request.params as { batchId: string };
            return { items: await listRows(batchId) };
        }
    );

    app.patch(
        "/portal/question-imports/:batchId/rows/:rowId",
        { onRequest: staff, schema: { params: importRowParams, body: rowPatchBody } },
        async (request) => {
            const { batchId, rowId } = request.params as { batchId: string; rowId: string };
            return updateRow(batchId, rowId, request.body as RowPatch);
        }
    );

    app.post(
        "/portal/question-imports/:batchId/rows",
        { onRequest: staff, schema: { params: importParams, body: addRowBody } },
        async (request, reply) => {
            const { batchId } = request.params as { batchId: string };
            const body = request.body as { sheet: string; sourceId: string; cells: SourceCells };
            const row = await addRow(batchId, body);
            reply.code(201);
            return row;
        }
    );

    app.post(
        "/portal/question-imports/:batchId/commit",
        { onRequest: staff, schema: { params: importParams } },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { batchId } = request.params as { batchId: string };

            const result = await commitBatch({ actorId: user.id }, batchId);
            return result;
        }
    );

    app.delete(
        "/portal/question-imports/:batchId",
        { onRequest: staff, schema: { params: importParams } },
        async (request, reply) => {
            const { batchId } = request.params as { batchId: string };
            await discardBatch(batchId);
            return reply.code(204).send();
        }
    );

    app.post(
        "/portal/question-imports/:batchId/commit-to-match",
        {
            onRequest: [requireRole("PORTAL", ["ADMIN"])],
            schema: { params: importParams, body: commitTargetBody }
        },
        async (request, reply) => {
            const user = request.sessionUser!;
            const { batchId } = request.params as { batchId: string };
            const { tournamentId, matchId } = request.body as {
                tournamentId: string;
                matchId: string;
            };

            const result = await commitBatchToMatch(
                { actorId: user.id },
                batchId,
                { tournamentId, matchId }
            );

            if (result.errors.length === 0) {
                await auditFromRequest(request, "question_published", {
                    details: { batchId, matchId, count: result.created }
                });
            }
            return result;
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
                    keywordId: query.keywordId,
                    search: query.search,
                    ids: query.ids
                        ?.split(",")
                        .map((id) => id.trim())
                        .filter((id) => id.length > 0),
                    cursor: query.cursor,
                    bucket: query.bucket
                },
                parsePage(query, MAX_PAGE_SIZE)
            );
        }
    );

    app.get(
        "/portal/questions/bucket-counts",
        { onRequest: staff, schema: { querystring: BucketCountsQuery } },
        async (request) => {
            const query = request.query as BucketCountsQuery;
            return bucketCounts({ status: query.status, search: query.search });
        }
    );

    app.get(
        "/portal/tournaments/:tournamentId/eligible-questions",
        {
            onRequest: staff,
            schema: {
                params: {
                    type: "object",
                    required: ["tournamentId"],
                    additionalProperties: false,
                    properties: { tournamentId: { type: "string", pattern: UUID_PATTERN } }
                },
                querystring: EligibleListQuery
            },
        },
        async (request) => {
            const user = request.sessionUser!;
            const { tournamentId } = request.params as { tournamentId: string };

            const tournament = await requireTournament(tournamentId).catch(() => {
                throw new QuestionError("NOT_FOUND", `tournament ${tournamentId} not found`);
            });
            if (!canViewTournament(tournament, user)) {
                throw new QuestionError("NOT_FOUND", `tournament ${tournamentId} not found`);
            }

            const query = request.query as EligibleListQuery;
            const kinds = query.kinds?.split(",") as QuestionKindValue[] | undefined;

            return listForAssembly(
                { kinds, bucket: query.bucket, search: query.search },
                parsePage(query, MAX_PAGE_SIZE)
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

    app.post(
        "/portal/questions/:questionId/duplicate",
        { onRequest: staff, schema: { params: flatQuestionParams } },
        async (request, reply) => {
            const { questionId } = request.params as { questionId: string };
            const row = await duplicateQuestion(
                { actorId: request.sessionUser!.id },
                questionId
            );
            reply.code(201);
            return row;
        }
    );

    app.get(
        "/portal/questions/:questionId/usage",
        { onRequest: staff, schema: { params: flatQuestionParams } },
        async (request) => {
            const { questionId } = request.params as { questionId: string };
            await getQuestion(questionId);
            return { items: await questionUsage(questionId) };
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
