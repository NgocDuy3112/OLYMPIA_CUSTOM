import readXlsxFile from "read-excel-file/node";
import type { Row } from "read-excel-file/node";
import { db } from "../../db/pool.js";
import { questionImportBatches, questionImportRows, type SourceCells } from "../../db/schema/index.js";
import {
    findAttachment,
    kindFor,
    mediaStorageConfigured,
    storeMedia,
    type MediaAttachment,
    type StoredMedia
} from "../../lib/media.js";
import { QuestionError } from "./errors.js";
import { MAX_BATCH_SIZE, type CreateQuestionInput } from "./schemas.js";
import {
    fingerprint,
    importQuestions,
    type BatchError,
    type BatchReport,
    type WriteContext
} from "./service.js";

export const EXCEL_MAX_BYTES = 5 * 1024 * 1024;

export const MEDIA_MAX_BYTES = 64 * 1024 * 1024;
export const MEDIA_MAX_FILES = 100;

export interface ExcelRowSummary {
    index: number;
    sheet: string;
    sourceId: string;
    bucket: string;
    kind: string;
}

export interface ExcelWarning {
    index: number;
    message: string;
}

export interface ExcelImportReport extends BatchReport {
    skipped: number;
    warnings: ExcelWarning[];
    rows: ExcelRowSummary[];
    stagedBatchId?: string;
}


const KNOWN_SHEETS = ["KHOI_DONG", "GIAI_MA", "BUT_PHA", "VE_DICH"] as const;

const DEFAULT_COLUMNS = { id: 0, question: 1, answer: 2, explanation: 3, note: 4, media: 5 } as const;
type ColumnKey = keyof typeof DEFAULT_COLUMNS;

const HEADER_TITLES: Record<ColumnKey, string> = {
    id: "id",
    question: "cau hoi",
    answer: "dap an",
    explanation: "giai thich",
    note: "ghi chu",
    media: "file anh/video/audio"
};

const ORAL_BUCKETS = new Set(["khoi-dong:rieng", "ve-dich:40", "ve-dich:50"]);

const DEFAULT_NORMALIZE = { caseSensitive: false, trim: true, stripAccents: true };


function cellText(cell: unknown): string {
    if (cell === null || cell === undefined) return "";
    if (cell instanceof Date) return cell.toISOString();
    return String(cell).trim();
}

function fold(value: unknown): string {
    return cellText(value)
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ");
}

function columnsOf(header: Row | undefined): Record<ColumnKey, number> {
    const columns: Record<ColumnKey, number> = { ...DEFAULT_COLUMNS };
    if (!header) return columns;
    header.forEach((cell, index) => {
        const title = fold(cell);
        for (const key of Object.keys(HEADER_TITLES) as ColumnKey[]) {
            if (title === HEADER_TITLES[key]) columns[key] = index;
        }
    });
    return columns;
}

interface SheetRows {
    rows: Row[];
    firstRow: number;
    columns: Record<ColumnKey, number>;
}

function splitHeader(data: Row[]): SheetRows {
    const headerIndex = data.findIndex((row) => fold(row[0]) === "id");
    if (headerIndex === -1) {
        return { rows: data, firstRow: 0, columns: { ...DEFAULT_COLUMNS } };
    }
    return {
        rows: data.slice(headerIndex + 1),
        firstRow: headerIndex + 1,
        columns: columnsOf(data[headerIndex])
    };
}


type Placement =
    | { ok: true; bucket: string; kind: "TEXT" | "KEYWORD" | "HINT"; isHint: boolean }
    | { ok: false; problem: string };

function place(sheet: string, sourceId: string): Placement {
    const mismatch = (expected: string): Placement => ({
        ok: false,
        problem: `"${sourceId}" is not a ${sheet} ID — expected ${expected}`
    });

    switch (sheet) {
        case "KHOI_DONG":
            if (/^KD_C_\d+$/.test(sourceId)) {
                return { ok: true, bucket: "khoi-dong:chung", kind: "TEXT", isHint: false };
            }
            if (/^KD_\d+_\d+$/.test(sourceId)) {
                return { ok: true, bucket: "khoi-dong:rieng", kind: "TEXT", isHint: false };
            }
            return mismatch("KD_<n>_<i> (riêng) or KD_C_<i> (chung)");
        case "GIAI_MA":
            if (sourceId === "GM_KEY") {
                return { ok: true, bucket: "giai-ma", kind: "KEYWORD", isHint: false };
            }
            if (/^GM_\d+$/.test(sourceId)) {
                return { ok: true, bucket: "giai-ma", kind: "HINT", isHint: true };
            }
            return mismatch("GM_KEY or GM_<n>");
        case "BUT_PHA":
            if (/^BP_\d+$/.test(sourceId)) {
                return { ok: true, bucket: "but-pha", kind: "TEXT", isHint: false };
            }
            return mismatch("BP_<n>");
        case "VE_DICH": {
            const cell = /^VD_(20|30|40|50)_\d+$/.exec(sourceId);
            if (cell) {
                return { ok: true, bucket: `ve-dich:${cell[1]}`, kind: "TEXT", isHint: false };
            }
            return mismatch("VD_20|30|40|50_<n>");
        }
        default:
            return { ok: false, problem: `sheet "${sheet}" has no bucket mapping` };
    }
}

interface BuiltRow {
    input: CreateQuestionInput;
    warning?: string;
}

function buildRow(args: {
    kind: "TEXT" | "KEYWORD" | "HINT";
    bucket: string;
    question: string;
    answer: string;
    explanation: string;
    note: string;
}): BuiltRow | { problem: string } {
    const { kind, bucket, question, answer, explanation, note } = args;

    const acceptedAnswers = answer
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (acceptedAnswers.length === 0) {
        return { problem: `"${question}" has no answer` };
    }

    const extra: Record<string, unknown> = {};
    if (explanation) extra.explanation = explanation;
    if (note) extra.note = note;

    let payload: Record<string, unknown>;
    if (kind === "KEYWORD") {
        if (acceptedAnswers.length > 1) {
            return { problem: `the keyword of "${question}" must be a single line` };
        }
        payload = {
            type: "KEYWORD",
            code: acceptedAnswers[0],
            normalize: { ...DEFAULT_NORMALIZE },
            ...extra
        };
    } else {
        payload = {
            type: "TEXT",
            acceptedAnswers,
            normalize: { ...DEFAULT_NORMALIZE },
            ...extra
        };
    }

    const input: CreateQuestionInput = {
        kind,
        questionText: question,
        payload: payload as CreateQuestionInput["payload"],
        tags: [bucket]
    };

    if (ORAL_BUCKETS.has(bucket)) {
        return {
            input,
            warning: `${bucket} is an ORAL group — imported as TEXT with no audience choices; give it its face in the dialog before it can enter a match`
        };
    }

    return { input };
}


export interface MappedRow {
    input: CreateQuestionInput | null;
    isHint: boolean;
    error: BatchError | null;
    warning: string | null;
    mediaRef: string;
}

interface Entry extends MappedRow {
    summary: ExcelRowSummary;
    cells: SourceCells;
    mediaFile?: MediaAttachment;
}

function appendWarning(entry: Entry, message: string): void {
    entry.warning = entry.warning ? `${entry.warning} · ${message}` : message;
}

function refused(
    index: number,
    sheet: string,
    sourceId: string,
    message: string,
    details: string[]
): MappedRow {
    return {
        input: null,
        isHint: false,
        error: { index, code: "VALIDATION", message, details },
        warning: null,
        mediaRef: ""
    };
}

export function mapSourceRow(args: {
    sheet: string;
    excelRow?: number;
    sourceId: string;
    cells: SourceCells;
    index: number;
}): MappedRow | null {
    const { sheet, excelRow, sourceId, cells, index } = args;
    const location = [
        excelRow ? `${sheet} row ${excelRow}` : `${sheet} (${sourceId || "no ID"})`
    ];
    const { question, answer } = cells;

    if (question === "" && answer === "") return null;

    if (sourceId === "") {
        return refused(index, sheet, sourceId, "this row has a question but no ID", [
            ...location,
            "the ID names the group: KD_…, GM_…, BP_…, VD_…"
        ]);
    }
    if (question === "") {
        return refused(index, sheet, sourceId, `"${sourceId}" has no question text`, location);
    }
    if (answer === "") {
        return refused(index, sheet, sourceId, `"${sourceId}" has no answer`, location);
    }

    const placed = place(sheet, sourceId);
    if (!placed.ok) {
        return refused(index, sheet, sourceId, placed.problem, location);
    }

    const built = buildRow({
        kind: placed.kind,
        bucket: placed.bucket,
        question,
        answer,
        explanation: cells.explanation,
        note: cells.note
    });
    if ("problem" in built) {
        return refused(index, sheet, sourceId, `"${sourceId}": ${built.problem}`, location);
    }

    return {
        input: built.input,
        isHint: placed.isHint,
        error: null,
        warning: built.warning ?? null,
        mediaRef: cells.media
    };
}


export interface ParsedWorkbook {
    entries: Entry[];
    skipped: number;
    sheetNames: string[];
}

async function parseWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
    let sheets: Array<{ sheet: string; data: Row[] }>;
    try {
        sheets = await readXlsxFile(buffer);
    } catch (error) {
        throw new QuestionError("VALIDATION", "that file could not be read as .xlsx", [
            error instanceof Error ? error.message : String(error)
        ]);
    }

    const entries: Entry[] = [];
    let skipped = 0;

    for (const sheet of sheets) {
        const name = sheet.sheet.trim().toUpperCase();
        const { rows, firstRow, columns } = splitHeader(sheet.data);

        if (!(KNOWN_SHEETS as readonly string[]).includes(name)) {
            const filled = rows.some((row) => row.some((cell) => cellText(cell) !== ""));
            if (filled) {
                throw new QuestionError("VALIDATION", `unknown sheet "${sheet.sheet}"`, [
                    `expected one of: ${KNOWN_SHEETS.join(", ")}`
                ]);
            }
            continue;
        }

        for (const [offset, row] of rows.entries()) {
            const excelRow = firstRow + offset + 1; 
            const index = entries.length;
            const sourceId = cellText(row[columns.id]);

            const mapped = mapSourceRow({
                sheet: name,
                excelRow,
                sourceId,
                cells: {
                    question: cellText(row[columns.question]),
                    answer: cellText(row[columns.answer]),
                    explanation: cellText(row[columns.explanation]),
                    note: cellText(row[columns.note]),
                    media: cellText(row[columns.media])
                },
                index
            });

            if (mapped === null) {
                skipped += 1;
                continue;
            }

            entries.push({
                ...mapped,
                summary: {
                    index,
                    sheet: name,
                    sourceId,
                    bucket: mapped.input?.tags?.[0] ?? "-",
                    kind: mapped.input?.kind ?? "-"
                },
                cells: {
                    question: cellText(row[columns.question]),
                    answer: cellText(row[columns.answer]),
                    explanation: cellText(row[columns.explanation]),
                    note: cellText(row[columns.note]),
                    media: cellText(row[columns.media])
                }
            });
        }
    }

    return { entries, skipped, sheetNames: sheets.map((sheet) => sheet.sheet) };
}

export function structuralProblems(
    rows: Array<{ index: number; kind: string }>
): Array<{ index: number; message: string; details: string[] }> {
    const keywords = rows.filter((row) => row.kind === "KEYWORD");
    const hints = rows.filter((row) => row.kind === "HINT");
    const problems: Array<{ index: number; message: string; details: string[] }> = [];

    if (hints.length > 0 && keywords.length === 0) {
        for (const hint of hints) {
            problems.push({
                index: hint.index,
                message: "hint rows need their GM_KEY row",
                details: ["GM_1…GM_8 hang from the keyword that GM_KEY defines — fill GM_KEY first"]
            });
        }
    }
    if (keywords.length > 1) {
        for (const duplicate of keywords.slice(1)) {
            problems.push({
                index: duplicate.index,
                message: "the file defines GM_KEY more than once",
                details: [`${keywords.length} GM_KEY rows — one Giải mã set has exactly one keyword`]
            });
        }
    }
    hints.slice(8).forEach((hint, offset) => {
        problems.push({
            index: hint.index,
            message: "a Giải mã set holds at most 8 hints",
            details: [`this file has ${hints.length} hint rows; this one is number ${offset + 9}`]
        });
    });

    return problems;
}


function report(
    dryRun: boolean,
    parsed: ParsedWorkbook,
    extra: Partial<ExcelImportReport> = {}
): ExcelImportReport {
    return {
        dryRun,
        total: parsed.entries.length,
        created: 0,
        ids: [],
        errors: [],
        warnings: parsed.entries
            .filter((entry) => entry.warning !== null)
            .map((entry) => ({ index: entry.summary.index, message: entry.warning as string })),
        skipped: parsed.skipped,
        rows: parsed.entries.map((entry) => entry.summary),
        ...extra
    };
}

const CHUNK_SIZE = MAX_BATCH_SIZE;

export const MAX_IMPORT_ROWS = CHUNK_SIZE * 10;

function chunked<T>(items: T[], size = CHUNK_SIZE): Array<{ start: number; items: T[] }> {
    const chunks: Array<{ start: number; items: T[] }> = [];
    for (let start = 0; start < items.length; start += size) {
        chunks.push({ start, items: items.slice(start, start + size) });
    }
    return chunks;
}

function remapTo(error: BatchError, canonicalIndex: number): BatchError {
    return { ...error, index: canonicalIndex };
}

function duplicatesInFile(parsed: ParsedWorkbook): BatchError[] {
    const seen = new Map<string, number>();
    const duplicates: BatchError[] = [];

    parsed.entries.forEach((entry, index) => {
        if (!entry.input) return;
        const print = fingerprint(entry.input);
        const first = seen.get(print);
        if (first === undefined) {
            seen.set(print, index);
            return;
        }
        duplicates.push({
            index,
            code: "DUPLICATE",
            message: `identical to row ${first + 1} of this file`,
            details: []
        });
    });

    return duplicates;
}

function attachMedia(
    parsed: ParsedWorkbook,
    attachments: readonly MediaAttachment[]
): BatchError[] {
    const errors: BatchError[] = [];

    parsed.entries.forEach((entry, index) => {
        if (!entry.mediaRef || !entry.input) return;

        const file = findAttachment(attachments, entry.mediaRef);
        if (!file) {
            appendWarning(
                entry,
                `media "${entry.mediaRef}" was not in the upload — not stored; bundle it with the workbook or set it in the dialog`
            );
            return;
        }
        if (!mediaStorageConfigured()) {
            errors.push({
                index,
                code: "MEDIA",
                message: `media "${entry.mediaRef}" arrived but cannot be stored — media storage is not configured (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY)`,
                details: []
            });
            return;
        }
        if (kindFor(file.filename, file.contentType) === null) {
            appendWarning(entry, `media "${entry.mediaRef}" names no media type — not stored`);
            return;
        }

        entry.mediaFile = file;
    });

    return errors;
}

async function uploadMedia(parsed: ParsedWorkbook): Promise<BatchError[]> {
    const uploads = new Map<string, StoredMedia>();
    const errors: BatchError[] = [];

    for (const [index, entry] of parsed.entries.entries()) {
        const file = entry.mediaFile;
        if (!file || !entry.input) continue;
        if (entry.input.media) continue;

        let stored = uploads.get(file.filename);
        if (!stored) {
            try {
                stored = await storeMedia(file);
            } catch (error) {
                errors.push({
                    index,
                    code: "MEDIA",
                    message: `media "${entry.mediaRef}": ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                    details: []
                });
                continue;
            }
            uploads.set(file.filename, stored);
        }
        entry.input.media = stored;
    }

    return errors;
}

const STAGE_CHUNK = 100;

async function stageWorkbook(
    ctx: WriteContext,
    parsed: ParsedWorkbook,
    sourceName: string | undefined,
    errors: BatchError[]
): Promise<string> {
    for (const error of errors) {
        const entry = parsed.entries[error.index];
        if (entry && entry.error === null) entry.error = error;
    }

    for (const failure of await uploadMedia(parsed)) {
        const entry = parsed.entries[failure.index];
        if (entry && entry.error === null) entry.error = failure;
    }

    const [batch] = await db
        .insert(questionImportBatches)
        .values({
            createdBy: ctx.actorId,
            sourceName: sourceName ?? null,
            rowCount: parsed.entries.length
        })
        .returning({ id: questionImportBatches.id });

    const rows = parsed.entries.map((entry) => ({
        batchId: batch.id,
        position: entry.summary.index,
        sheet: entry.summary.sheet,
        sourceId: entry.summary.sourceId,
        cells: entry.cells,
        media: entry.input?.media ?? null,
        error: entry.error?.message ?? null,
        warning: entry.warning
    }));

    for (let start = 0; start < rows.length; start += STAGE_CHUNK) {
        await db.insert(questionImportRows).values(rows.slice(start, start + STAGE_CHUNK));
    }

    return batch.id;
}

export async function importExcel(
    ctx: WriteContext,
    buffer: Buffer,
    dryRun: boolean,
    attachments: readonly MediaAttachment[] = [],
    options: { sourceName?: string } = {}
): Promise<ExcelImportReport> {
    const parsed = await parseWorkbook(buffer);

    if (parsed.entries.length === 0) {
        throw new QuestionError("VALIDATION", "no questions in that file", [
            parsed.sheetNames.length > 0
                ? `sheets: ${parsed.sheetNames.join(", ")} — every row was empty`
                : "no sheets found"
        ]);
    }
    if (parsed.entries.length > MAX_IMPORT_ROWS) {
        throw new QuestionError(
            "VALIDATION",
            `an import may hold at most ${MAX_IMPORT_ROWS} questions`,
            [`${parsed.entries.length} filled rows in this file`]
        );
    }

    const refuse = async (errors: BatchError[]): Promise<ExcelImportReport | null> => {
        if (dryRun) return null;
        const stagedBatchId = await stageWorkbook(ctx, parsed, options.sourceName, errors);
        const stagedErrors = parsed.entries
            .map((entry) => entry.error)
            .filter((error): error is BatchError => error !== null)
            .sort((a, b) => a.index - b.index);
        return { ...report(false, parsed, { errors: stagedErrors }), stagedBatchId };
    };

    const structural = structuralProblems(
        parsed.entries.map((entry) => ({
            index: entry.summary.index,
            kind: entry.input?.kind ?? "-"
        }))
    ).map((problem) => ({
        index: problem.index,
        code: "VALIDATION",
        message: problem.message,
        details: problem.details
    }));

    const mediaErrors = attachMedia(parsed, attachments);

    const rowErrors = [
        ...parsed.entries
            .map((entry) => entry.error)
            .filter((error): error is BatchError => error !== null),
        ...structural,
        ...mediaErrors
    ].sort((a, b) => a.index - b.index);

    if (rowErrors.length > 0) {
        return (await refuse(rowErrors)) ?? report(dryRun, parsed, { errors: rowErrors });
    }

    const fileDuplicates = duplicatesInFile(parsed);
    if (fileDuplicates.length > 0) {
        return (await refuse(fileDuplicates)) ?? report(dryRun, parsed, { errors: fileDuplicates });
    }

    const inputs = parsed.entries.map((entry) => entry.input as CreateQuestionInput);

    const validationErrors: BatchError[] = [];
    for (const { start, items } of chunked(inputs)) {
        const validation = await importQuestions(ctx, items, true);
        if (validation.errors.length > 0) {
            validationErrors.push(
                ...validation.errors.map((error) => remapTo(error, start + error.index))
            );
        }
    }
    if (validationErrors.length > 0) {
        const sorted = validationErrors.sort((a, b) => a.index - b.index);
        return (await refuse(sorted)) ?? report(dryRun, parsed, { errors: sorted });
    }
    if (dryRun) return report(true, parsed);

    const uploadErrors = await uploadMedia(parsed);
    if (uploadErrors.length > 0) {
        return (await refuse(uploadErrors)) ?? report(false, parsed, { errors: uploadErrors });
    }

    const mainPositions: number[] = [];
    const hintPositions: number[] = [];
    parsed.entries.forEach((entry, index) => {
        if (entry.isHint) hintPositions.push(index);
        else mainPositions.push(index);
    });

    const write = async (positions: number[], attach?: { keywordId: string }) => {
        const ids: string[] = [];
        const errors: BatchError[] = [];
        const items = positions.map((index) => {
            const input = parsed.entries[index].input as CreateQuestionInput;
            return attach ? { ...input, keywordId: attach.keywordId } : input;
        });

        for (const { start, items: slice } of chunked(items)) {
            const result = await importQuestions(ctx, slice, false);
            ids.push(...result.ids);
            if (result.errors.length > 0) {
                errors.push(
                    ...result.errors.map((error) =>
                        remapTo(error, positions[start + error.index] ?? error.index)
                    )
                );
                break; 
            }
        }
        return { ids, errors };
    };

    const main = await write(mainPositions);
    if (main.errors.length > 0) {
        return report(false, parsed, { errors: main.errors });
    }

    if (hintPositions.length === 0) {
        return report(false, parsed, { created: main.ids.length, ids: main.ids });
    }

    const keywordIndex = parsed.entries.findIndex(
        (entry) => entry.summary.kind === "KEYWORD"
    );
    const keywordId = main.ids[mainPositions.indexOf(keywordIndex)];

    const hints = await write(hintPositions, { keywordId });

    return report(false, parsed, {
        created: main.ids.length + hints.ids.length,
        ids: [...main.ids, ...hints.ids],
        errors: [...main.errors, ...hints.errors].sort((a, b) => a.index - b.index)
    });
}
