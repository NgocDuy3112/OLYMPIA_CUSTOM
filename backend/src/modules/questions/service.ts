import { and, count, desc, eq, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matchAssemblyEvents, matches, questionBank } from "../../db/schema/index.js";
import { QuestionError } from "./errors.js";
import {
    CreateQuestionInput,
    MAX_BATCH_SIZE,
    UpdateQuestionInput,
    validate
} from "./schemas.js";
import type { QuestionKindValue } from "./payload.js";
import {
    ALL_BUCKETS,
    QUESTION_TYPES,
    assertPayloadForType,
    bucketOfTags,
    expandBucketParam,
    payloadWithType,
    requireBucketTag,
    type QuestionType
} from "./buckets.js";
import { assertTransition, type ActorRole, type QuestionStatusValue } from "./transitions.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";

export { MAX_BATCH_SIZE };

export type QuestionRow = typeof questionBank.$inferSelect;

export interface WriteContext {
    actorId: string;
    importBatchId?: string;
}

function deriveType(kind: string, payload: unknown): QuestionType {
    const declared = (payload as { type?: unknown } | null | undefined)?.type;
    if (typeof declared === "string" && (QUESTION_TYPES as readonly string[]).includes(declared)) {
        return declared as QuestionType;
    }
    return kind === "HINT" ? "TEXT" : (kind as QuestionType);
}

function normalizeTags(tags: string[] | undefined): string[] | undefined {
    if (tags === undefined) return undefined;
    if (tags.length === 0) return [];
    requireBucketTag(tags);
    return tags;
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
    assertPayloadForType(deriveType(input.kind, input.payload), input.payload);
    normalizeTags(input.tags);
}


function scopedPayload<P>(
    type: QuestionType,
    payload: P,
    tags: readonly string[] | undefined
): P & { type: QuestionType } {
    const stamped = payloadWithType(type, payload as Record<string, unknown>) as P & {
        type: QuestionType;
    };
    if (!bucketOfTags(tags)) return stamped;
    const { bucket: _bridge, ...withoutBridge } = stamped as Record<string, unknown>;
    return withoutBridge as P & { type: QuestionType };
}


function questionValues(ctx: WriteContext, input: CreateQuestionInput) {
    const type = deriveType(input.kind, input.payload);
    const tags = normalizeTags(input.tags) ?? [];
    return {
        kind: input.kind,
        questionText: input.questionText,
        keywordId: input.keywordId ?? null,
        payload: scopedPayload(type, input.payload, tags),
        tags,
        media: input.media ?? null,
        timeLimit: input.timeLimit ?? null,
        status: "DRAFT" as const,
        importBatchId: ctx.importBatchId ?? null,
        createdBy: ctx.actorId
    };
}


const HINTS_PER_SET = 8;

async function assertHintSet(
    kind: string,
    keywordId: string | null | undefined,
    excludeHintId?: string
): Promise<void> {
    if (kind !== "HINT") {
        if (keywordId) {
            throw new QuestionError("VALIDATION", "keywordId applies to HINT questions only");
        }
        return;
    }
    if (!keywordId) {
        throw new QuestionError("VALIDATION", "a HINT belongs to a keyword set (keywordId is required)");
    }

    const [keyword] = await db
        .select({ kind: questionBank.kind })
        .from(questionBank)
        .where(eq(questionBank.id, keywordId))
        .limit(1);
    if (!keyword || keyword.kind !== "KEYWORD") {
        throw new QuestionError("VALIDATION", `keyword ${keywordId} is not a KEYWORD question`);
    }

    const inSet = and(
        eq(questionBank.kind, "HINT"),
        eq(questionBank.keywordId, keywordId),
        ...(excludeHintId ? [ne(questionBank.id, excludeHintId)] : [])
    );
    const [tally] = await db.select({ value: count() }).from(questionBank).where(inSet);
    if ((tally?.value ?? 0) >= HINTS_PER_SET) {
        throw new QuestionError("VALIDATION", `this set already holds ${HINTS_PER_SET}/${HINTS_PER_SET} hints`);
    }
}

export async function createQuestion(
    ctx: WriteContext,
    input: CreateQuestionInput
): Promise<QuestionRow> {
    assertQuestionPayload(input);
    await assertHintSet(input.kind, input.keywordId);

    const [row] = await db
        .insert(questionBank)
        .values(questionValues(ctx, input))
        .returning();
    return row;
}


export async function getQuestion(id: string): Promise<QuestionRow> {
    return requireQuestion(id);
}


export async function duplicateQuestion(
    ctx: WriteContext,
    id: string
): Promise<QuestionRow> {
    const source = await requireQuestion(id);

    if (source.kind === "HINT") {
        await assertHintSet("HINT", source.keywordId);
    }

    const [row] = await db
        .insert(questionBank)
        .values({
            kind: source.kind,
            questionText: source.questionText,
            keywordId: source.keywordId,
            payload: source.payload,
            media: source.media,
            timeLimit: source.timeLimit,
            tags: source.tags,
            status: "DRAFT",
            createdBy: ctx.actorId
        })
        .returning();
    return row;
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

    if (patch.kind !== undefined && patch.kind !== existing.kind) {
        const convertible =
            (existing.kind === "TEXT" && patch.kind === "HINT") ||
            (existing.kind === "HINT" && patch.kind === "TEXT");
        if (!convertible) {
            throw new QuestionError(
                "VALIDATION",
                `kind cannot change from ${existing.kind} to ${patch.kind}`,
                ["only TEXT ↔ HINT conversion is allowed"]
            );
        }
    }

    if (patch.payload) {
        const type = deriveType(patch.kind ?? existing.kind, patch.payload);
        assertPayloadForType(type, patch.payload);
        patch = { ...patch, payload: payloadWithType(type, patch.payload) };
    }
    if (patch.tags !== undefined) {
        patch = { ...patch, tags: normalizeTags(patch.tags) };
        if (bucketOfTags(patch.tags)) {
            const current = (patch.payload ?? existing.payload) as Record<string, unknown>;
            if (current.bucket !== undefined) {
                const { bucket: _bridge, ...withoutBridge } = current;
                patch = { ...patch, payload: withoutBridge as UpdateQuestionInput["payload"] };
            }
        }
    }

    const nextKind = patch.kind ?? existing.kind;
    if (nextKind === "HINT") {
        const keywordId = patch.keywordId !== undefined ? patch.keywordId : existing.keywordId;
        await assertHintSet("HINT", keywordId, existing.kind === "HINT" ? existing.id : undefined);
    } else if (patch.keywordId !== undefined || existing.kind === "HINT") {
        await assertHintSet(nextKind, patch.keywordId);
        if (existing.kind === "HINT" && patch.keywordId === undefined) {
            patch = { ...patch, keywordId: null };
        }
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

    if (existing.status === next) return existing;   

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
    keywordId?: string;
    search?: string;
    ids?: string[];
    cursor?: string;
    bucket?: string;
}

function paramList(values: readonly string[]): SQL {
    return sql.join(
        values.map((value) => sql`${value}`),
        sql`, `
    );
}

function bucketCondition(bucket: string): SQL {
    const list = expandBucketParam(bucket);
    const values = paramList(list);
    const clauses: SQL[] = [
        sql`"question_bank"."tags" && ARRAY[${values}]::text[]`,
        sql`"question_bank"."payload" ->> 'bucket' IN (${values})`
    ];
    if (list.includes("giai-ma")) {
        clauses.push(sql`"question_bank"."kind" IN ('KEYWORD', 'HINT')`);
    }
    clauses.push(
        sql`("question_bank"."tags" = '{}' AND "question_bank"."payload" ->> 'bucket' IS NULL AND "question_bank"."kind" NOT IN ('KEYWORD', 'HINT'))`
    );
    return clauses.reduce((accumulated, clause) => sql`${accumulated} OR ${clause}`);
}


function filterConditions(filters: ListFilters) {
    const conditions = [];


    if (filters.status) conditions.push(eq(questionBank.status, filters.status));
    if (filters.kind) conditions.push(eq(questionBank.kind, filters.kind));
    if (filters.keywordId) conditions.push(eq(questionBank.keywordId, filters.keywordId));
    if (filters.ids) conditions.push(inArray(questionBank.id, filters.ids));
    if (filters.bucket) conditions.push(bucketCondition(filters.bucket));

    return conditions;
}


export async function listQuestions(
    filters: ListFilters,
    page: Page
): Promise<PageResult<QuestionRow>> {
    const search = filters.search ? questionSearch(filters.search) : null;
    const conditions = filterConditions(filters);
    if (search) conditions.push(search.condition);

    const itemConditions = [...conditions];
    if (filters.cursor && !search) {
        itemConditions.push(
            sql`("question_bank"."created_at", "question_bank"."id") < (SELECT "created_at", "id" FROM "question_bank" WHERE "id" = ${filters.cursor})`
        );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const itemWhere = itemConditions.length > 0 ? and(...itemConditions) : undefined;

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
        .where(itemWhere)
        .orderBy(...order)
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


export interface BucketCountFilters {
    status?: QuestionStatusValue;
    search?: string;
}

export async function bucketCounts(
    filters: BucketCountFilters
): Promise<Record<string, number>> {
    const search = filters.search ? questionSearch(filters.search) : null;
    const conditions = [];
    if (filters.status) conditions.push(eq(questionBank.status, filters.status));
    if (search) conditions.push(search.condition);
    const where = conditions.length > 0 ? and(...conditions) : sql`TRUE`;

    const values = paramList([...ALL_BUCKETS]);
    const result = await db.execute(sql`
        SELECT bucket, count(*)::int AS n
        FROM (
            SELECT COALESCE(
                (SELECT t FROM unnest(tags) AS t WHERE t IN (${values}) LIMIT 1),
                payload ->> 'bucket',
                CASE WHEN kind IN ('KEYWORD', 'HINT') THEN 'giai-ma' END
            ) AS bucket
            FROM question_bank
            WHERE ${where}
        ) AS rows
        WHERE bucket IS NOT NULL
        GROUP BY bucket
    `);

    const counts: Record<string, number> = {};
    for (const row of result.rows as Array<{ bucket: string; n: number }>) {
        counts[row.bucket] = row.n;
    }
    return counts;
}


export interface QuestionUsage {
    id: string;
    tournamentId: string;
    label: string;
    stageId: string;
    status: string;
}

export async function questionUsage(questionId: string): Promise<QuestionUsage[]> {
    const result = await db.execute(sql`
        SELECT id, tournament_id, label, stage_id, status::text AS status
        FROM matches
        WHERE deleted_at IS NULL
          AND questions @> ${JSON.stringify([{ sourceId: questionId }])}::jsonb
        ORDER BY updated_at DESC
        LIMIT 20
    `);
    return (
        result.rows as Array<{
            id: string;
            tournament_id: string;
            label: string;
            stage_id: string;
            status: string;
        }>
    ).map((row) => ({
        id: row.id,
        tournamentId: row.tournament_id,
        label: row.label,
        stageId: row.stage_id,
        status: row.status
    }));
}


export function assemblyEligibility() {
    return [eq(questionBank.status, "PUBLISHED")];
}


export interface AssemblyFilters {
    kinds?: QuestionKindValue[];
    bucket?: string;
    search?: string;
}


export async function listForAssembly(
    filters: AssemblyFilters,
    page: Page
): Promise<PageResult<QuestionRow>> {
    const conditions = assemblyEligibility();
    const search = filters.search ? questionSearch(filters.search) : null;

    if (filters.kinds && filters.kinds.length > 0) {
        conditions.push(inArray(questionBank.kind, filters.kinds));
    }
    if (filters.bucket) conditions.push(bucketCondition(filters.bucket));
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

export function fingerprint(input: {
    kind: string;
    questionText: string;
    payload: unknown;
    tags?: readonly string[];
}): string {
    const raw =
        input.payload !== null && typeof input.payload === "object"
            ? (input.payload as Record<string, unknown>)
            : null;

    const bucket =
        bucketOfTags(input.tags ?? []) ??
        (typeof raw?.bucket === "string" ? raw.bucket : null);

    let payload = input.payload;
    if (raw) {
        const stamped = payloadWithType(deriveType(input.kind, raw), raw);
        const { bucket: _bridge, ...withoutBridge } = stamped;
        payload = withoutBridge;
    }

    return JSON.stringify([
        input.kind,
        input.questionText,
        bucket,
        canonicalize(payload)
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
        const existing = await db
            .select({
                id: questionBank.id,
                kind: questionBank.kind,
                questionText: questionBank.questionText,
                payload: questionBank.payload,
                tags: questionBank.tags
            })
            .from(questionBank);

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


export function agentEligibility() {
    return [inArray(questionBank.status, ["PUBLISHED", "ARCHIVED"])];
}

export interface AgentFilters {
    kind?: QuestionKindValue;
    search?: string;
}

export async function listForAgent(
    filters: AgentFilters,
    page: Page
): Promise<PageResult<QuestionRow>> {
    const conditions = agentEligibility();
    const search = filters.search ? questionSearch(filters.search) : null;

    if (filters.kind) conditions.push(eq(questionBank.kind, filters.kind));
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
    questionId: string
): Promise<QuestionRow> {
    const [row] = await db
        .select()
        .from(questionBank)
        .where(and(eq(questionBank.id, questionId), ...agentEligibility()))
        .limit(1);

    if (!row) throw new QuestionError("NOT_FOUND", `question ${questionId} not found`);
    return row;
}
