import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import { buildXlsx, type SheetSpec } from "../helpers/xlsx.js";
import { AOC_ROUNDS, aocRoundConfig } from "../../src/game/engine/aoc-rulebook.js";

const STUB_PORT = 18102;
const puts: string[] = [];

process.env.S3_ENDPOINT = `http://127.0.0.1:${STUB_PORT}`;
process.env.S3_REGION = "auto";
process.env.S3_BUCKET = "oc-test";
process.env.S3_ACCESS_KEY_ID = "test-key";
process.env.S3_SECRET_ACCESS_KEY = "test-secret";

const { buildApp } = await import("../../src/app.js");
const { db } = await import("../../src/db/pool.js");
const {
    matchAssemblyEvents,
    matches,
    questionBank,
    questionImportRows,
    tournaments,
    users,
} = await import("../../src/db/schema/index.js");
const { signToken } = await import("../../src/lib/jwt.js");

type TestApp = Awaited<ReturnType<typeof buildApp>>;

const HEADER = ["ID", "Câu hỏi", "Đáp án", "Giải thích", "Ghi chú", "File ảnh/video/audio"];
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const ROUND_CONFIGS = Object.fromEntries(
    AOC_ROUNDS.map((round) => [round.id, aocRoundConfig(round.id)!])
);

interface ImportBody {
    dryRun: boolean;
    total: number;
    created: number;
    ids: string[];
    stagedBatchId?: string;
    errors: Array<{ index: number; code: string; message: string; details: string[] }>;
    warnings: Array<{ index: number; message: string }>;
    rows: Array<{ index: number; sheet: string; sourceId: string; bucket: string; kind: string }>;
    skipped: number;
}

interface StagedRow {
    id: string;
    position: number;
    sheet: string;
    sourceId: string;
    cells: { question: string; answer: string; explanation: string; note: string; media: string };
    media: { url: string; type: string } | null;
    error: string | null;
    warning: string | null;
    dropped: boolean;
    bucket: string | null;
    kind: string | null;
}

interface StagedBatch {
    id: string;
    sourceName: string | null;
    rowCount: number;
    ready: number;
    toFix: number;
    dropped: number;
    remaining: number;
}

let app: TestApp;
let base: string;
let stub: Server;
let adminCookie: string;
let operatorCookie: string;
let playerCookie: string;

function bundle(sheets: SheetSpec[], files: Array<{ name: string; content: Buffer }> = []): FormData {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buildXlsx(sheets))]), "workbook.xlsx");
    for (const file of files) {
        form.append("media", new Blob([new Uint8Array(file.content)], { type: "image/png" }), file.name);
    }
    return form;
}

async function postImport(
    sheets: SheetSpec[],
    options: { dryRun?: boolean; files?: Array<{ name: string; content: Buffer }>; cookie?: string } = {}
): Promise<{ status: number; body: ImportBody }> {
    const query = options.dryRun ? "?dryRun=true" : "";
    const response = await fetch(`${base}/portal/questions/import-excel${query}`, {
        method: "POST",
        headers: { cookie: options.cookie ?? adminCookie },
        body: bundle(sheets, options.files ?? []),
    });
    return { status: response.status, body: (await response.json()) as ImportBody };
}

async function call(
    path: string,
    options: { method?: string; body?: unknown; cookie?: string } = {}
): Promise<{ status: number; body: any }> {
    const response = await fetch(`${base}${path}`, {
        method: options.method ?? "GET",
        headers: {
            cookie: options.cookie ?? adminCookie,
            ...(options.body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : undefined };
}

function dirtyBook(suffix: string, withMedia = false): SheetSpec {
    return {
        name: "BUT_PHA",
        rows: [
            HEADER,
            [
                "BP_1",
                `Câu hỏi ổn ${suffix}`,
                `Đáp án ${suffix}`,
                null,
                null,
                withMedia ? "anh.png" : null,
            ],
            ["BP_2", `Câu hỏi thiếu ${suffix}`, null, null, null, null],
        ],
    };
}

async function stage(suffix: string, options: { withMedia?: boolean } = {}): Promise<string> {
    const result = await postImport([dirtyBook(suffix, options.withMedia)], {
        files: options.withMedia ? [{ name: "anh.png", content: PNG }] : [],
    });
    expect(result.body.stagedBatchId).toBeTruthy();
    return result.body.stagedBatchId!;
}

async function fixAll(batchId: string): Promise<void> {
    const { body } = await call(`/portal/question-imports/${batchId}/rows`);
    for (const row of body.items as StagedRow[]) {
        if (!row.error) continue;
        await call(`/portal/question-imports/${batchId}/rows/${row.id}`, {
            method: "PATCH",
            body: { cells: { answer: `Đáp án sửa ${row.sourceId}` } },
        });
    }
}

beforeAll(async () => {
    stub = createServer((request, response) => {
        request.resume();
        request.on("end", () => {
            puts.push(request.url ?? "");
            response.writeHead(200, { ETag: '"stub"' });
            response.end();
        });
    });
    await new Promise<void>((resolve) => stub.listen(STUB_PORT, "127.0.0.1", resolve));

    app = await buildApp();
    await app.listen({ port: 0 });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

    const [admin, operator, player] = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "stg-admin", displayName: "Staging Admin" },
            { role: "OPERATOR", username: "stg-op", displayName: "Staging Op" },
            { role: "PLAYER", username: "stg-player", email: "stg@example.test", displayName: "Staging Player" },
        ])
        .returning({ id: users.id, role: users.role });

    const cookieFor = (user: { id: string; role: string }) =>
        `portal_session=${signToken(app, "PORTAL", {
            sub: user.id,
            role: user.role as "ADMIN" | "OPERATOR" | "PLAYER",
            tokenVersion: 0,
        })}`;
    adminCookie = cookieFor(admin);
    operatorCookie = cookieFor(operator);
    playerCookie = cookieFor(player);
});

afterAll(async () => {
    await app.close();
    stub.close();
    await db.$client.end();
    delete process.env.S3_ENDPOINT;
    delete process.env.S3_REGION;
    delete process.env.S3_BUCKET;
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
});

describe("a file that will not commit", () => {
    it("stages instead of writing, and says where it went", async () => {
        const before = await db.select({ id: questionBank.id }).from(questionBank);
        const result = await postImport([dirtyBook("stage-one")]);

        expect(result.status).toBe(200); 
        expect(result.body.created).toBe(0);
        expect(result.body.stagedBatchId).toBeTruthy();
        expect(result.body.errors).toHaveLength(1);
        expect(result.body.errors[0].message).toContain("has no answer");

        const after = await db.select({ id: questionBank.id }).from(questionBank);
        expect(after.length).toBe(before.length); 
    });

    it("lists the batch with its counts, and maps every row", async () => {
        const batchId = await stage("stage-two");
        const { body } = await call("/portal/question-imports");

        expect(body.active?.id).toBe(batchId);
        expect(body.active).toMatchObject({ sourceName: "workbook.xlsx", rowCount: 2, ready: 1, toFix: 1 });

        const { body: rows } = await call(`/portal/question-imports/${batchId}/rows`);
        expect((rows.items as StagedRow[]).map((row) => `${row.sourceId}:${row.error ? "bad" : "ok"}`)).toEqual([
            "BP_1:ok",
            "BP_2:bad",
        ]);
        expect((rows.items as StagedRow[])[0]).toMatchObject({ bucket: "but-pha", kind: "TEXT" });
        expect((rows.items as StagedRow[])[1].bucket).toBeNull();
    });

    it("fixing a cell clears its error and derives the bucket — same mapper as the upload", async () => {
        const batchId = await stage("stage-three");
        const { body: rows } = await call(`/portal/question-imports/${batchId}/rows`);
        const broken = (rows.items as StagedRow[]).find((row) => row.error)!;

        const { status, body: fixed } = await call(
            `/portal/question-imports/${batchId}/rows/${broken.id}`,
            { method: "PATCH", body: { cells: { answer: "Đáp án đã sửa" } } }
        );

        expect(status).toBe(200);
        expect(fixed.error).toBeNull();
        expect(fixed.bucket).toBe("but-pha");
        expect(fixed.kind).toBe("TEXT");
        expect(fixed.cells.answer).toBe("Đáp án đã sửa");
    });

    it("dropping a row keeps it out of the commit; restoring brings it back", async () => {
        const batchId = await stage("stage-four");
        const { body: rows } = await call(`/portal/question-imports/${batchId}/rows`);
        const broken = (rows.items as StagedRow[]).find((row) => row.error)!;

        const dropped = await call(`/portal/question-imports/${batchId}/rows/${broken.id}`, {
            method: "PATCH",
            body: { dropped: true },
        });
        expect(dropped.body.dropped).toBe(true);

        const commit = await call(`/portal/question-imports/${batchId}/commit`, { method: "POST" });
        expect(commit.body.errors).toEqual([]);
        expect(commit.body.created).toBe(1);

        const restored = await call(`/portal/question-imports/${batchId}/rows/${broken.id}`);
        expect(restored.status).toBe(404); 
    });

    it("refuses to commit while a row is broken — and writes nothing", async () => {
        const batchId = await stage("stage-five");
        const before = await db.select({ id: questionBank.id }).from(questionBank);

        const commit = await call(`/portal/question-imports/${batchId}/commit`, { method: "POST" });
        expect(commit.status).toBe(200); 
        expect(commit.body.created).toBe(0);
        expect(commit.body.errors).toHaveLength(1);
        expect(commit.body.errors[0].message).toContain("has no answer");

        const after = await db.select({ id: questionBank.id }).from(questionBank);
        expect(after.length).toBe(before.length);

        const { body } = await call(`/portal/question-imports/${batchId}/rows`);
        expect((body.items as StagedRow[])).toHaveLength(2);
    });

    it("commits to the bank as DRAFT carrying import_batch_id, then empties the batch", async () => {
        const batchId = await stage("stage-six");
        await fixAll(batchId);

        const commit = await call(`/portal/question-imports/${batchId}/commit`, { method: "POST" });
        expect(commit.body.errors).toEqual([]);
        expect(commit.body.created).toBe(2);

        const rows = await db
            .select()
            .from(questionBank)
            .where(eq(questionBank.importBatchId, batchId));
        expect(rows).toHaveLength(2);
        expect(rows.every((row) => row.status === "DRAFT")).toBe(true);

        const { body } = await call("/portal/question-imports");
        expect(body.active?.id).not.toBe(batchId);
        const committed = (body.batches as StagedBatch[]).find((batch) => batch.id === batchId);
        expect(committed).toMatchObject({ remaining: 0, rowCount: 2 });
        expect((await db.select().from(questionImportRows).where(eq(questionImportRows.batchId, batchId)))).toHaveLength(0);
    });

    it("keeps the media it was handed — the bytes only exist during the upload", async () => {
        puts.length = 0;
        const batchId = await stage("stage-seven", { withMedia: true });
        expect(puts).toHaveLength(1); 

        const { body: rows } = await call(`/portal/question-imports/${batchId}/rows`);
        const withMedia = (rows.items as StagedRow[]).find((row) => row.cells.media === "anh.png")!;
        expect(withMedia.media).toMatchObject({ type: "image" });
        expect(withMedia.media?.url).toContain("/oc-test/media/");

        await fixAll(batchId);
        const commit = await call(`/portal/question-imports/${batchId}/commit`, { method: "POST" });
        expect(commit.body.created).toBe(2);

        const stored = await db
            .select()
            .from(questionBank)
            .where(eq(questionBank.importBatchId, batchId));
        const media = stored.find((row) => row.media !== null);
        expect(media?.media).toMatchObject({ type: "image", url: withMedia.media?.url });
    });

    it("discards a batch without touching the bank", async () => {
        const batchId = await stage("stage-eight");
        const before = await db.select({ id: questionBank.id }).from(questionBank);

        const discard = await call(`/portal/question-imports/${batchId}`, { method: "DELETE" });
        expect(discard.status).toBe(204);

        const after = await db.select({ id: questionBank.id }).from(questionBank);
        expect(after.length).toBe(before.length);
        const { status } = await call(`/portal/question-imports/${batchId}/rows`);
        expect(status).toBe(404);
    });

    it("refuses every route to a PLAYER", async () => {
        const batchId = await stage("stage-nine");
        expect((await call("/portal/question-imports", { cookie: playerCookie })).status).toBe(403);
        expect(
            (await call(`/portal/question-imports/${batchId}/commit`, {
                method: "POST",
                cookie: playerCookie,
            })).status
        ).toBe(403);
        expect(
            (await call(`/portal/question-imports/${batchId}`, { method: "DELETE", cookie: playerCookie }))
                .status
        ).toBe(403);
    });
});

describe("the row the file was missing", () => {
    it("blocks every hint until the GM_KEY row is added — then commits as one set", async () => {
        const sheets: SheetSpec[] = [
            {
                name: "GIAI_MA",
                rows: [
                    HEADER,
                    ["GM_1", "Gợi ý đầu tiên", "Cố đô", null, null, null],
                ],
            },
        ];
        const staged = await postImport(sheets);
        expect(staged.body.stagedBatchId).toBeTruthy();

        const batchId = staged.body.stagedBatchId!;
        const { body: rows } = await call(`/portal/question-imports/${batchId}/rows`);
        expect((rows.items as StagedRow[])[0].error).toContain("need their GM_KEY row");

        const blocked = await call(`/portal/question-imports/${batchId}/commit`, { method: "POST" });
        expect(blocked.body.created).toBe(0);
        expect(blocked.body.errors[0].message).toContain("GM_KEY");

        const added = await call(`/portal/question-imports/${batchId}/rows`, {
            method: "POST",
            body: {
                sheet: "GIAI_MA",
                sourceId: "GM_KEY",
                cells: { question: "Từ khóa bí mật", answer: "Hà Nội", explanation: "", note: "", media: "" },
            },
        });
        expect(added.status).toBe(201);
        expect(added.body.error).toBeNull();

        const commit = await call(`/portal/question-imports/${batchId}/commit`, { method: "POST" });
        expect(commit.body.errors).toEqual([]);
        expect(commit.body.created).toBe(2);

        const set = await db
            .select()
            .from(questionBank)
            .where(eq(questionBank.importBatchId, batchId));
        const keyword = set.find((row) => row.kind === "KEYWORD")!;
        const hint = set.find((row) => row.kind === "HINT")!;
        expect(hint.keywordId).toBe(keyword.id);
    });
});

describe("commit straight to a match", () => {
    let tournamentId: string;
    let matchId: string;

    beforeAll(async () => {
        const tournament = await call("/portal/tournaments", {
            method: "POST",
            body: {
                name: "Staging Tournament",
                stages: [{ id: "stage-1", title: "Stage 1" }],
                format: { competitorsPerMatch: 2 },
                placementTiers: [{ min: 1, max: 2, points: 3 }],
            },
        });
        tournamentId = tournament.body.id;

        const match = await call(`/portal/tournaments/${tournamentId}/matches`, {
            method: "POST",
            body: {
                stageId: "stage-1",
                label: "Staged match",
                scheduledAt: "2026-03-01T10:00:00Z",
                roundConfigs: ROUND_CONFIGS,
            },
        });
        matchId = match.body.id;
    });

    it("is refused to an OPERATOR (ADMIN only)", async () => {
        const batchId = await stage("match-one");
        await fixAll(batchId);

        const refused = await call(`/portal/question-imports/${batchId}/commit-to-match`, {
            method: "POST",
            cookie: operatorCookie,
            body: { tournamentId, matchId },
        });
        expect(refused.status).toBe(403);
    });

    it("publishes the rows, appends them to the match, and writes ONE assembly event", async () => {
        const batchId = await stage("match-two");
        await fixAll(batchId);

        const before = await db
            .select()
            .from(matchAssemblyEvents)
            .where(eq(matchAssemblyEvents.matchId, matchId));

        const commit = await call(`/portal/question-imports/${batchId}/commit-to-match`, {
            method: "POST",
            body: { tournamentId, matchId },
        });
        expect(commit.status).toBe(200);
        expect(commit.body.errors).toEqual([]);
        expect(commit.body.created).toBe(2);
        expect(commit.body.assemblyRevision).toBe(1);

        const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
        expect((match.questions as unknown[]).length).toBe(2);

        const published = await db
            .select()
            .from(questionBank)
            .where(eq(questionBank.importBatchId, batchId));
        expect(published.every((row) => row.status === "PUBLISHED")).toBe(true);

        const after = await db
            .select()
            .from(matchAssemblyEvents)
            .where(eq(matchAssemblyEvents.matchId, matchId));
        expect(after.length - before.length).toBe(1); 
    });

    it("takes the questions back out when the match refuses — the batch survives", async () => {
        const batchId = await stage("match-three");
        await fixAll(batchId);

        const refused = await call(`/portal/question-imports/${batchId}/commit-to-match`, {
            method: "POST",
            body: { tournamentId, matchId: "00000000-0000-4000-8000-000000000099" },
        });
        expect(refused.status).toBe(404);

        const leftovers = await db
            .select()
            .from(questionBank)
            .where(eq(questionBank.importBatchId, batchId));
        expect(leftovers).toHaveLength(0);
        const { body } = await call(`/portal/question-imports/${batchId}/rows`);
        expect((body.items as StagedRow[])).toHaveLength(2);
    });
});
