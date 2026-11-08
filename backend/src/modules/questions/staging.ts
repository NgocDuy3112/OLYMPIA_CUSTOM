import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    questionBank,
    questionImportBatches,
    questionImportRows,
    type SourceCells
} from "../../db/schema/index.js";
import type { Media } from "../../game/contracts/index.js";
import { patchAssemble } from "../matches/assemble-patch.js";
import { getMatch } from "../matches/service.js";
import { QuestionError } from "./errors.js";
import { slotForBucket } from "./buckets.js";
import { mapSourceRow, structuralProblems, type MappedRow } from "./excel.js";
import {
    importQuestions,
    type BatchError,
    type WriteContext
} from "./service.js";

const CELLS: Array<keyof SourceCells> = ["question", "answer", "explanation", "note", "media"];

export interface StagedBatch {
    id: string;
    sourceName: string | null;
    rowCount: number;
    ready: number;
    toFix: number;
    dropped: number;
    remaining: number;
    createdAt: Date;
}

export interface StagedRow {
    id: string;
    position: number;
    sheet: string;
    sourceId: string;
    cells: SourceCells;
    media: Media | null;
    error: string | null;
    warning: string | null;
    dropped: boolean;
    bucket: string | null;
    kind: string | null;
}

export interface RowPatch {
    cells?: Partial<SourceCells>;
    dropped?: boolean;
}

export interface CommitResult {
    created: number;
    ids: string[];
    errors: BatchError[];
}

async function requireBatch(batchId: string) {
    const [batch] = await db
        .select()
        .from(questionImportBatches)
        .where(eq(questionImportBatches.id, batchId))
        .limit(1);
    if (!batch) throw new QuestionError("NOT_FOUND", `import ${batchId} not found`);
    return batch;
}


export async function listBatches(): Promise<StagedBatch[]> {
    const result = await db.execute(sql`
        SELECT b.id,
               b.source_name,
               b.row_count,
               b.created_at,
               count(r.id) FILTER (WHERE r.error IS NULL AND NOT r.dropped)::int AS ready,
               count(r.id) FILTER (WHERE r.error IS NOT NULL AND NOT r.dropped)::int AS "toFix",
               count(r.id) FILTER (WHERE r.dropped)::int AS dropped,
               count(r.id)::int AS remaining
          FROM question_import_batches b
          LEFT JOIN question_import_rows r ON r.batch_id = b.id
         GROUP BY b.id
         ORDER BY b.created_at DESC
         LIMIT 20
    `);

    return (result.rows as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        sourceName: (row.source_name as string | null) ?? null,
        rowCount: Number(row.row_count),
        ready: Number(row.ready),
        toFix: Number(row.toFix),
        dropped: Number(row.dropped),
        remaining: Number(row.remaining),
        createdAt: new Date(String(row.created_at))
    }));
}

export async function activeBatch(): Promise<StagedBatch | null> {
    const batches = await listBatches();
    return batches.find((batch) => batch.remaining > 0) ?? null;
}

export async function listRows(batchId: string): Promise<StagedRow[]> {
    await requireBatch(batchId);
    const rows = await db
        .select()
        .from(questionImportRows)
        .where(eq(questionImportRows.batchId, batchId))
        .orderBy(asc(questionImportRows.position));

    return rows.map((row) => {
        const mapped = mapFor(row);
        return {
            id: row.id,
            position: row.position,
            sheet: row.sheet,
            sourceId: row.sourceId,
            cells: row.cells,
            media: row.media,
            error: row.error,
            warning: row.warning,
            dropped: row.dropped,
            bucket: mapped?.input?.tags?.[0] ?? null,
            kind: mapped?.input?.kind ?? null
        };
    });
}

function mapFor(row: typeof questionImportRows.$inferSelect): MappedRow | null {
    return mapSourceRow({
        sheet: row.sheet,
        sourceId: row.sourceId,
        cells: row.cells,
        index: row.position
    });
}


export async function updateRow(
    batchId: string,
    rowId: string,
    patch: RowPatch
): Promise<StagedRow> {
    await requireBatch(batchId);

    const [row] = await db
        .select()
        .from(questionImportRows)
        .where(and(eq(questionImportRows.id, rowId), eq(questionImportRows.batchId, batchId)))
        .limit(1);
    if (!row) throw new QuestionError("NOT_FOUND", `row ${rowId} not found`);

    const cells: SourceCells = { ...row.cells, ...(patch.cells ?? {}) };

    const mediaChanged = patch.cells?.media !== undefined && patch.cells.media !== row.cells.media;

    const mapped = mapSourceRow({
        sheet: row.sheet,
        sourceId: row.sourceId,
        cells,
        index: row.position
    });

    const error = mapped === null
        ? "this row is empty — drop it, or fill in a question and an answer"
        : mapped.error?.message ?? null;

    const [updated] = await db
        .update(questionImportRows)
        .set({
            cells,
            error,
            warning: mapped?.warning ?? null,
            ...(patch.dropped !== undefined ? { dropped: patch.dropped } : {}),
            ...(mediaChanged ? { media: null } : {}),
            updatedAt: new Date()
        })
        .where(eq(questionImportRows.id, rowId))
        .returning();

    return {
        id: updated.id,
        position: updated.position,
        sheet: updated.sheet,
        sourceId: updated.sourceId,
        cells: updated.cells,
        media: updated.media,
        error: updated.error,
        warning: updated.warning,
        dropped: updated.dropped,
        bucket: mapped?.input?.tags?.[0] ?? null,
        kind: mapped?.input?.kind ?? null
    };
}

export async function addRow(
    batchId: string,
    input: { sheet: string; sourceId: string; cells: SourceCells }
): Promise<StagedRow> {
    const batch = await requireBatch(batchId);

    const mapped = mapSourceRow({
        sheet: input.sheet,
        sourceId: input.sourceId,
        cells: input.cells,
        index: batch.rowCount
    });
    if (mapped === null) {
        throw new QuestionError("VALIDATION", "an empty row cannot be added", [
            "fill in a question and an answer"
        ]);
    }

    const [last] = await db
        .select({ position: questionImportRows.position })
        .from(questionImportRows)
        .where(eq(questionImportRows.batchId, batchId))
        .orderBy(desc(questionImportRows.position))
        .limit(1);

    const [row] = await db
        .insert(questionImportRows)
        .values({
            batchId,
            position: (last?.position ?? -1) + 1,
            sheet: input.sheet,
            sourceId: input.sourceId,
            cells: input.cells,
            error: mapped.error?.message ?? null,
            warning: mapped.warning
        })
        .returning();

    return {
        id: row.id,
        position: row.position,
        sheet: row.sheet,
        sourceId: row.sourceId,
        cells: row.cells,
        media: row.media,
        error: row.error,
        warning: row.warning,
        dropped: row.dropped,
        bucket: mapped.input?.tags?.[0] ?? null,
        kind: mapped.input?.kind ?? null
    };
}

export async function discardBatch(batchId: string): Promise<void> {
    await requireBatch(batchId);
    await db.delete(questionImportBatches).where(eq(questionImportBatches.id, batchId));
}


type Prepared = {
    rows: Array<{
        row: typeof questionImportRows.$inferSelect;
        input: NonNullable<MappedRow["input"]>;
    }>;
};

async function prepareCommit(
    batchId: string
): Promise<Prepared | { errors: BatchError[] }> {
    await requireBatch(batchId);

    const staged = await db
        .select()
        .from(questionImportRows)
        .where(and(eq(questionImportRows.batchId, batchId), eq(questionImportRows.dropped, false)))
        .orderBy(asc(questionImportRows.position));

    if (staged.length === 0) {
        throw new QuestionError("VALIDATION", "this batch has nothing left to commit", [
            "every row was dropped — discard the batch instead"
        ]);
    }

    const errors: BatchError[] = [];
    const rows: Prepared["rows"] = [];

    for (const row of staged) {
        const mapped = mapFor(row);
        if (mapped === null) {
            errors.push({
                index: row.position,
                code: "VALIDATION",
                message: "this row is empty — drop it, or fill in a question and an answer",
                details: [`${row.sheet} (${row.sourceId})`]
            });
            continue;
        }
        if (mapped.error) {
            errors.push(mapped.error);
            continue;
        }
        rows.push({ row, input: mapped.input! });
    }

    const structural = structuralProblems(
        rows.map((entry, index) => ({ index, kind: entry.input.kind }))
    );
    for (const problem of structural) {
        const position = rows[problem.index]?.row.position;
        if (position === undefined) continue;
        errors.push({
            index: position,
            code: "VALIDATION",
            message: problem.message,
            details: problem.details
        });
    }

    if (errors.length > 0) {
        return { errors: errors.sort((a, b) => a.index - b.index) };
    }
    return { rows };
}

async function insertPrepared(
    ctx: WriteContext,
    batchId: string,
    prepared: Prepared
): Promise<{ ids: string[]; errors: BatchError[]; idByIndex: Map<number, string> }> {
    const inputs = prepared.rows.map(({ row, input }) => ({
        ...input,
        media: row.media ?? input.media ?? null
    }));

    const mainPositions: number[] = [];
    const hintPositions: number[] = [];
    inputs.forEach((input, index) => {
        if (input.kind === "HINT") hintPositions.push(index);
        else mainPositions.push(index);
    });

    const idByIndex = new Map<number, string>();
    const errors: BatchError[] = [];

    const run = async (positions: number[], attach?: { keywordId: string }) => {
        const items = positions.map((index) => {
            const input = inputs[index];
            return attach ? { ...input, keywordId: attach.keywordId } : input;
        });

        for (let start = 0; start < items.length; start += 100) {
            const slice = items.slice(start, start + 100);
            const result = await importQuestions(
                { ...ctx, importBatchId: batchId },
                slice,
                false
            );
            result.ids.forEach((id, offset) => idByIndex.set(positions[start + offset], id));

            if (result.errors.length > 0) {
                errors.push(
                    ...result.errors.map((error) => ({
                        ...error,
                        index: positions[start + error.index] ?? error.index
                    }))
                );
                return; 
            }
        }
    };

    await run(mainPositions);

    if (errors.length === 0 && hintPositions.length > 0) {
        const keywordIndex = inputs.findIndex((input) => input.kind === "KEYWORD");
        const keywordId = idByIndex.get(keywordIndex);
        if (!keywordId) {
            errors.push({
                index: prepared.rows[keywordIndex]?.row.position ?? 0,
                code: "VALIDATION",
                message: "hint rows need their GM_KEY row",
                details: ["the keyword could not be inserted"]
            });
        } else {
            await run(hintPositions, { keywordId });
        }
    }

    return { ids: [...idByIndex.values()], errors, idByIndex };
}

async function forgetRows(batchId: string): Promise<void> {
    await db.delete(questionImportRows).where(eq(questionImportRows.batchId, batchId));
}

export async function commitBatch(ctx: WriteContext, batchId: string): Promise<CommitResult> {
    const prepared = await prepareCommit(batchId);
    if ("errors" in prepared) return { created: 0, ids: [], errors: prepared.errors };

    const inserted = await insertPrepared(ctx, batchId, prepared);
    if (inserted.errors.length > 0) {
        return { created: inserted.ids.length, ids: inserted.ids, errors: inserted.errors };
    }

    await forgetRows(batchId);
    return { created: inserted.ids.length, ids: inserted.ids, errors: [] };
}

export interface MatchCommitResult extends CommitResult {
    assemblyRevision?: number;
}

export async function commitBatchToMatch(
    ctx: WriteContext,
    batchId: string,
    target: { tournamentId: string; matchId: string }
): Promise<MatchCommitResult> {
    const prepared = await prepareCommit(batchId);
    if ("errors" in prepared) return { created: 0, ids: [], errors: prepared.errors };

    const inserted = await insertPrepared(ctx, batchId, prepared);
    if (inserted.errors.length > 0) {
        return { created: inserted.ids.length, ids: inserted.ids, errors: inserted.errors };
    }

    try {
        await db
            .update(questionBank)
            .set({ status: "PUBLISHED", updatedAt: new Date() })
            .where(inArray(questionBank.id, inserted.ids));

        const match = await getMatch(target.tournamentId, target.matchId);
        const existing = (
            match.questions as Array<{
                roundId: string;
                turnId: string;
                sourceId: string;
                points?: number;
            }>
        ).map((question) => ({
            roundId: question.roundId,
            turnId: question.turnId,
            sourceId: question.sourceId,
            ...(question.points !== undefined ? { points: question.points } : {})
        }));

        const fresh = prepared.rows.map(({ input }, index) => {
            const bucket = input.tags?.[0];
            if (!bucket) {
                throw new QuestionError("VALIDATION", "a staged row has no bucket", [
                    `${input.questionText.slice(0, 40)} — re-tag it before committing`
                ]);
            }
            const slot = slotForBucket(bucket);
            if (!slot.turnId) {
                throw new QuestionError("VALIDATION", `no match slot for bucket "${bucket}"`);
            }
            const sourceId = inserted.idByIndex.get(index);
            if (!sourceId) {
                throw new QuestionError("VALIDATION", "a staged row did not become a question", [
                    input.questionText.slice(0, 40)
                ]);
            }
            return { roundId: slot.roundId, turnId: slot.turnId, sourceId, ...(slot.points !== undefined ? { points: slot.points } : {}) };
        });

        const result = await patchAssemble(
            target.tournamentId,
            target.matchId,
            { baseRevision: match.assemblyRevision, questions: [...existing, ...fresh] },
            ctx.actorId
        );

        await forgetRows(batchId);
        return {
            created: inserted.ids.length,
            ids: inserted.ids,
            errors: [],
            assemblyRevision: result.assemblyRevision
        };
    } catch (error) {
        await db
            .delete(questionBank)
            .where(
                and(
                    inArray(questionBank.id, inserted.ids),
                    eq(questionBank.importBatchId, batchId)
                )
            );

        if (error instanceof QuestionError) throw error;
        const details = (error as { details?: string[] }).details ?? [];
        const code = (error as { code?: string }).code;
        const mapped =
            code === "NOT_FOUND"
                ? "NOT_FOUND"
                : code === "IMMUTABLE"
                  ? "IMMUTABLE"
                  : code === "FORBIDDEN"
                    ? "FORBIDDEN"
                    : "VALIDATION";
        throw new QuestionError(
            mapped,
            error instanceof Error ? error.message : String(error),
            details
        );
    }
}
