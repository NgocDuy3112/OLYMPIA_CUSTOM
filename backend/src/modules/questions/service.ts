import { and, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { questionBank } from "../../db/schema/index.js";
import { QuestionError } from "./errors.js";
import {
    CreateQuestionInput,
    MAX_BATCH_SIZE,
    UpdateQuestionInput,
    validate
} from "./schemas.js";
import { assertPayloadForKind, type QuestionKindValue } from "./payload.js";
import { assertTransition, type ActorRole, type QuestionStatusValue } from "./transitions.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";

export { MAX_BATCH_SIZE };

export type QuestionRow = typeof questionBank.$inferSelect;

export interface WriteContext {
    actorId: string;
}


async function requireQuestion(id: string): Promise<QuestionRow> {
    const [row] = await db
        .select()
        .from(questionBank)
        .where(eq(questionBank.id, id))
        .limit(1);
    if (!row) throw new QuestionError("NOT_FOUND", `question ${id} not found`);
    return row;
}


function assertQuestionPayload(input: CreateQuestionInput): void {
    validate(CreateQuestionInput, input);
    assertPayloadForKind(input.kind as QuestionKindValue, input.payload);
}


function questionValues(ctx: WriteContext, input: CreateQuestionInput) {
    return {
        kind: input.kind,
        questionText: input.questionText,
        tag: input.tag,
        payload: input.payload,
        media: input.media ?? null,
        timeLimit: input.timeLimit ?? null,
        status: "DRAFT" as const,
        createdBy: ctx.actorId
    };
}


export async function createQuestion(
    ctx: WriteContext,
    input: CreateQuestionInput
): Promise<QuestionRow> {
    assertQuestionPayload(input);

    const [row] = await db
        .insert(questionBank)
        .values(questionValues(ctx, input))
        .returning();
    return row;
}


export async function getQuestion(id: string): Promise<QuestionRow> {
    return requireQuestion(id);
}


export async function updateQuestion(
    id: string,
    patch: UpdateQuestionInput
): Promise<QuestionRow> {
    validate(UpdateQuestionInput, patch);

    const existing = await requireQuestion(id);

    if (existing.status === "ARCHIVED") {
        throw new QuestionError("IMMUTABLE", `question ${id} is archived and cannot be edited`);
    }

    if (patch.payload) {
        assertPayloadForKind(existing.kind as QuestionKindValue, patch.payload);
    }


    const [row] = await db
        .update(questionBank)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(questionBank.id, id))
        .returning();
    return row;
}


export async function transitionQuestion(
    id: string,
    next: QuestionStatusValue,
    actorRole: ActorRole
): Promise<QuestionRow> {
    const existing = await requireQuestion(id);

    if (existing.status === next) return existing;   // idempotent no-op

    assertTransition(existing.status as QuestionStatusValue, next, actorRole);

    const [row] = await db
        .update(questionBank)
        .set({ status: next, updatedAt: new Date() })
        .where(eq(questionBank.id, id))
        .returning();
    return row;
}


export function questionSearch(term: string) {
    const tokens = term
        .split(/\s+/)
        .map((token) => token.replace(/[^\p{L}\p{N}]+/gu, ""))
        .filter((token) => token.length > 0);

    if (tokens.length === 0) return null;

    const query = tokens
        .map((token, index) => (index === tokens.length - 1 ? `${token}:*` : token))
        .join(" & ");

    const tsquery = sql`to_tsquery('simple', immutable_unaccent(${query}))`;

    return {
        condition: sql`"question_bank"."search_vector" @@ ${tsquery}`,
        rank: sql`ts_rank("question_bank"."search_vector", ${tsquery})`
    };
}


export interface ListFilters {

    status?: QuestionStatusValue;
    kind?: QuestionKindValue;
    tag?: string;
    search?: string;
}


function filterConditions(filters: ListFilters) {
    const conditions = [];


    if (filters.status) conditions.push(eq(questionBank.status, filters.status));
    if (filters.kind) conditions.push(eq(questionBank.kind, filters.kind));
    if (filters.tag) conditions.push(eq(questionBank.tag, filters.tag));

    return conditions;
}


export async function listQuestions(
    filters: ListFilters,
    page: Page
): Promise<PageResult<QuestionRow>> {
    const search = filters.search ? questionSearch(filters.search) : null;
    const conditions = filterConditions(filters);
    if (search) conditions.push(search.condition);

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totals] = await db
        .select({ total: count() })
        .from(questionBank)
        .where(where);

    const order = search
        ? [desc(search.rank), desc(questionBank.createdAt), desc(questionBank.id)]
        : [desc(questionBank.createdAt), desc(questionBank.id)];

    const items = await db
        .select()
        .from(questionBank)
        .where(where)
        .orderBy(...order)
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


// The single visibility rule for assembly (schema.md §question_bank):
// PUBLISHED questions, tagged with one of the tournament's own tags. The bank is global;
// the tags are what scope it.
// Shared by the paged read below and by the auto-pick query in assembly.ts.
export function assemblyEligibility(tags: string[]) {
    return [
        eq(questionBank.status, "PUBLISHED"),
        inArray(questionBank.tag, tags.length > 0 ? tags : [""])
    ];
}


export interface AssemblyFilters {
    kinds?: QuestionKindValue[];
    search?: string;
}


// Paged: an unpaged version returned every eligible row (18.7k at 25k bank size).
export async function listForAssembly(
    tags: string[],
    filters: AssemblyFilters,
    page: Page
): Promise<PageResult<QuestionRow>> {
    const conditions = assemblyEligibility(tags);
    const search = filters.search ? questionSearch(filters.search) : null;

    if (filters.kinds && filters.kinds.length > 0) {
        conditions.push(inArray(questionBank.kind, filters.kinds));
    }
    if (search) conditions.push(search.condition);

    const where = and(...conditions);

    const [totals] = await db.select({ total: count() }).from(questionBank).where(where);

    const order = search
        ? [desc(search.rank), desc(questionBank.createdAt), desc(questionBank.id)]
        : [desc(questionBank.createdAt), desc(questionBank.id)];

    const items = await db
        .select()
        .from(questionBank)
        .where(where)
        .orderBy(...order)
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


const BATCH_INSERT_CHUNK = 100;

export interface BatchError {
    index: number;
    code: string;
    message: string;
    details: string[];
}

export interface BatchReport {
    dryRun: boolean;
    total: number;
    created: number;
    ids: string[];
    errors: BatchError[];
}


// Stable across key order, so an identical question re-serialised differently
// still fingerprints the same. Array order is preserved (option order matters).
function canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonicalize);

    if (value !== null && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([key, nested]) => [key, canonicalize(nested)])
        );
    }

    return value;
}

function fingerprint(input: {
    kind: string;
    questionText: string;
    tag: string;
    payload: unknown;
}): string {
    return JSON.stringify([
        input.kind,
        input.questionText,
        input.tag,
        canonicalize(input.payload)
    ]);
}


export async function importQuestions(
    ctx: WriteContext,
    items: unknown[],
    dryRun: boolean
): Promise<BatchReport> {
    if (items.length === 0) {
        throw new QuestionError("VALIDATION", "no questions supplied");
    }
    if (items.length > MAX_BATCH_SIZE) {
        throw new QuestionError(
            "VALIDATION",
            `a batch may contain at most ${MAX_BATCH_SIZE} questions`
        );
    }

    const errors: BatchError[] = [];
    const shaped: Array<{ index: number; input: CreateQuestionInput }> = [];

    for (const [index, item] of items.entries()) {
        try {
            assertQuestionPayload(item as CreateQuestionInput);
        } catch (error) {
            if (error instanceof QuestionError) {
                errors.push({
                    index,
                    code: error.code,
                    message: error.message,
                    details: error.details
                });
                continue;
            }
            throw error;
        }

        shaped.push({ index, input: item as CreateQuestionInput });
    }


    const accepted: Array<{ index: number; input: CreateQuestionInput }> = [];

    for (const candidate of shaped) {
        accepted.push(candidate);
    }

    const seenInBatch = new Map<string, number>();
    const duplicatedInBatch = new Set<number>();

    for (const { index, input } of accepted) {
        const print = fingerprint(input);
        const firstIndex = seenInBatch.get(print);

        if (firstIndex !== undefined) {
            errors.push({
                index,
                code: "DUPLICATE",
                message: `identical to row ${firstIndex} of this batch`,
                details: []
            });
            duplicatedInBatch.add(index);
        } else {
            seenInBatch.set(print, index);
        }
    }

    const remaining = accepted.filter(({ index }) => !duplicatedInBatch.has(index));

    if (remaining.length > 0) {
        const tags = [...new Set(remaining.map(({ input }) => input.tag))];

        const existing = await db
            .select({
                id: questionBank.id,
                kind: questionBank.kind,
                questionText: questionBank.questionText,
                tag: questionBank.tag,
                payload: questionBank.payload
            })
            .from(questionBank)
            .where(inArray(questionBank.tag, tags));

        const existingByPrint = new Map(
            existing.map((row) => [fingerprint(row), row.id])
        );

        for (const { index, input } of remaining) {
            const existingId = existingByPrint.get(fingerprint(input));

            if (existingId) {
                errors.push({
                    index,
                    code: "DUPLICATE",
                    message: `identical to existing question ${existingId}`,
                    details: []
                });
            }
        }
    }

    errors.sort((a, b) => a.index - b.index);
    if (errors.length > 0 || dryRun) {
        return { dryRun, total: items.length, created: 0, ids: [], errors };
    }

    const ids = await db.transaction(async (tx) => {
        const collected: string[] = [];

        for (let start = 0; start < accepted.length; start += BATCH_INSERT_CHUNK) {
            const chunk = accepted
                .slice(start, start + BATCH_INSERT_CHUNK)
                .map(({ input }) => questionValues(ctx, input));

            const inserted = await tx
                .insert(questionBank)
                .values(chunk)
                .returning({ id: questionBank.id });

            collected.push(...inserted.map((row) => row.id));
        }

        return collected;
    });

    return { dryRun, total: items.length, created: ids.length, ids, errors: [] };
}


export function agentEligibility(tags: string[]) {
    return [
        inArray(questionBank.status, ["PUBLISHED", "ARCHIVED"]),
        inArray(questionBank.tag, tags.length > 0 ? tags : [""])
    ];
}

export interface AgentFilters {
    kind?: QuestionKindValue;
    tag?: string;
    search?: string;
}

export async function listForAgent(
    tags: string[],
    filters: AgentFilters,
    page: Page
): Promise<PageResult<QuestionRow>> {
    const conditions = agentEligibility(tags);
    const search = filters.search ? questionSearch(filters.search) : null;

    if (filters.kind) conditions.push(eq(questionBank.kind, filters.kind));
    if (filters.tag) conditions.push(eq(questionBank.tag, filters.tag));
    if (search) conditions.push(search.condition);

    const where = and(...conditions);

    const [totals] = await db.select({ total: count() }).from(questionBank).where(where);

    const order = search
        ? [desc(search.rank), desc(questionBank.createdAt), desc(questionBank.id)]
        : [desc(questionBank.createdAt), desc(questionBank.id)];

    const items = await db
        .select()
        .from(questionBank)
        .where(where)
        .orderBy(...order)
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


export async function getForAgent(
    tags: string[],
    questionId: string
): Promise<QuestionRow> {
    const [row] = await db
        .select()
        .from(questionBank)
        .where(and(eq(questionBank.id, questionId), ...agentEligibility(tags)))
        .limit(1);

    if (!row) throw new QuestionError("NOT_FOUND", `question ${questionId} not found`);
    return row;
}