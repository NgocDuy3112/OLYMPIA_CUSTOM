import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { and, eq } from "drizzle-orm";
import { buildXlsx, type Cell, type SheetSpec } from "../helpers/xlsx.js";

const STUB_PORT = 18099;
const puts: string[] = [];

process.env.S3_ENDPOINT = `http://127.0.0.1:${STUB_PORT}`;
process.env.S3_REGION = "auto";
process.env.S3_BUCKET = "oc-test";
process.env.S3_ACCESS_KEY_ID = "test-key";
process.env.S3_SECRET_ACCESS_KEY = "test-secret";

const { buildApp } = await import("../../src/app.js");
const { db } = await import("../../src/db/pool.js");
const { questionBank, users } = await import("../../src/db/schema/index.js");
const { signToken } = await import("../../src/lib/jwt.js");

type TestApp = Awaited<ReturnType<typeof buildApp>>;

const HEADER = ["ID", "Câu hỏi", "Đáp án", "Giải thích", "Ghi chú", "File ảnh/video/audio"];
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

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

interface UploadedFile {
    name: string;
    content: Buffer;
    type?: string;
}

let app: TestApp;
let base: string;
let stub: Server;
let cookie: string;
let actorId: string;

function bundle(sheets: SheetSpec[], files: UploadedFile[] = []): FormData {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buildXlsx(sheets))]), "workbook.xlsx");
    for (const file of files) {
        form.append(
            "media",
            new Blob([new Uint8Array(file.content)], file.type ? { type: file.type } : undefined),
            file.name
        );
    }
    return form;
}

async function postImport(
    sheets: SheetSpec[],
    options: { dryRun?: boolean; files?: UploadedFile[] } = {}
): Promise<{ status: number; body: ImportBody }> {
    const query = options.dryRun ? "?dryRun=true" : "";
    const response = await fetch(`${base}/portal/questions/import-excel${query}`, {
        method: "POST",
        headers: { cookie },
        body: bundle(sheets, options.files ?? [])
    });
    return { status: response.status, body: (await response.json()) as ImportBody };
}

function bankRows() {
    return db.select().from(questionBank).where(eq(questionBank.createdBy, actorId));
}

function rowsFor(questionText: string) {
    return db
        .select()
        .from(questionBank)
        .where(and(eq(questionBank.createdBy, actorId), eq(questionBank.questionText, questionText)));
}

beforeAll(async () => {
    stub = createServer((request, response) => {
        request.resume();
        request.on("end", () => {
            puts.push(`${request.method} ${request.url ?? ""}`);
            response.writeHead(200, { ETag: '"stub"' });
            response.end();
        });
    });
    await new Promise<void>((resolve) => stub.listen(STUB_PORT, "127.0.0.1", resolve));

    app = await buildApp();
    await app.listen({ port: 0 });
    base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

    const [admin] = await db
        .insert(users)
        .values({ role: "ADMIN", username: "excel-admin", displayName: "Excel Admin" })
        .returning({ id: users.id });
    actorId = admin.id;
    cookie = `portal_session=${signToken(app, "PORTAL", {
        sub: admin.id,
        role: "ADMIN",
        tokenVersion: 0
    })}`;
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

describe("POST /portal/questions/import-excel", () => {
    it("maps every sheet and ID to its group, and links the hint to its keyword", async () => {
        const sheets: SheetSpec[] = [
            {
                name: "KHOI_DONG",
                rows: [
                    HEADER,
                    ["KD_1_1", "Khởi động riêng", "Hà Nội", "Thủ đô", "ghi chú", null],
                    ["KD_C_1", "Khởi động chung", "42", null, null, null],
                    ["KD_1_2", null, null, null, null, null] 
                ]
            },
            {
                name: "GIAI_MA",
                rows: [
                    HEADER,
                    ["GM_1", "Gợi ý đầu tiên", "Cố đô", null, null, null],
                    ["GM_KEY", "Từ khóa bí mật", "Hà Nội", null, null, null]
                ]
            },
            { name: "BUT_PHA", rows: [HEADER, ["BP_1", "Bứt phá", "Đáp án BP", null, null, null]] },
            {
                name: "VE_DICH",
                rows: [
                    HEADER,
                    ["VD_20_1", "Về đích 20", "Đáp án 20", null, null, null],
                    ["VD_50_1", "Về đích 50", "Đáp án 50", null, null, null]
                ]
            }
        ];

        const dry = await postImport(sheets, { dryRun: true });
        expect(dry.status).toBe(200);
        expect(dry.body.errors).toEqual([]);
        expect(dry.body.total).toBe(7);
        expect(dry.body.skipped).toBe(1);
        expect(dry.body.rows.map((row) => `${row.sourceId}→${row.bucket}`)).toEqual([
            "KD_1_1→khoi-dong:rieng",
            "KD_C_1→khoi-dong:chung",
            "GM_1→giai-ma",
            "GM_KEY→giai-ma",
            "BP_1→but-pha",
            "VD_20_1→ve-dich:20",
            "VD_50_1→ve-dich:50"
        ]);
        expect(dry.body.rows.find((row) => row.sourceId === "GM_KEY")?.kind).toBe("KEYWORD");
        expect(dry.body.rows.find((row) => row.sourceId === "GM_1")?.kind).toBe("HINT");

        const real = await postImport(sheets);
        expect(real.status).toBe(200);
        expect(real.body.created).toBe(7);

        const rows = await bankRows();
        const keyword = rows.find((row) => row.kind === "KEYWORD");
        const hint = rows.find((row) => row.kind === "HINT");
        expect(hint?.keywordId).toBe(keyword?.id);

        const rieng = rows.find((row) => row.questionText === "Khởi động riêng");
        expect(rieng).toBeDefined();
        expect(rieng?.tags).toEqual(["khoi-dong:rieng"]);
        expect(rieng?.payload).not.toHaveProperty("bucket");
        expect(rieng?.payload).toMatchObject({
            type: "TEXT",
            acceptedAnswers: ["Hà Nội"],
            explanation: "Thủ đô",
            note: "ghi chú"
        });

        const oral = rows.find((row) => row.questionText === "Về đích 50");
        expect(oral?.tags).toEqual(["ve-dich:50"]);
        expect(oral?.status).toBe("DRAFT");
    });

    it("reports the ORAL groups as warnings (they import as TEXT until given a face)", async () => {
        const sheets: SheetSpec[] = [
            { name: "KHOI_DONG", rows: [HEADER, ["KD_3_1", "Riêng mới", "Đáp án", null, null, null]] },
            { name: "VE_DICH", rows: [HEADER, ["VD_40_1", "Bốn mươi", "Đáp án", null, null, null]] }
        ];

        const dry = await postImport(sheets, { dryRun: true });
        expect(dry.body.errors).toEqual([]);
        expect(dry.body.warnings.map((warning) => warning.message)).toEqual([
            expect.stringContaining("khoi-dong:rieng is an ORAL group"),
            expect.stringContaining("ve-dich:40 is an ORAL group")
        ]);
    });

    it("stages a half row instead of writing it — and the bank stays untouched", async () => {
        const before = (await bankRows()).length;
        const sheets: SheetSpec[] = [
            { name: "BUT_PHA", rows: [HEADER, ["BP_7", "Câu hỏi thiếu đáp án", null, null, null, null]] }
        ];

        const dry = await postImport(sheets, { dryRun: true });
        expect(dry.body.created).toBe(0);
        expect(dry.body.stagedBatchId).toBeUndefined(); 
        expect(dry.body.errors).toHaveLength(1);
        expect(dry.body.errors[0]).toMatchObject({ index: 0, code: "VALIDATION" });
        expect(dry.body.errors[0].message).toContain("has no answer");
        expect(dry.body.errors[0].details).toContain("BUT_PHA row 2");

        const real = await postImport(sheets);
        expect(real.status).toBe(200);
        expect(real.body.created).toBe(0);
        expect(real.body.stagedBatchId).toBeTruthy();
        expect(real.body.errors).toHaveLength(1);
        expect((await bankRows()).length).toBe(before);
    });

    it("warns for a File cell whose file was not bundled — and imports the row anyway", async () => {
        const sheets: SheetSpec[] = [
            { name: "BUT_PHA", rows: [HEADER, ["BP_8", "Có media", "Đáp án", null, null, "anh.png"]] }
        ];

        const dry = await postImport(sheets, { dryRun: true });
        expect(dry.body.errors).toEqual([]);
        expect(
            dry.body.warnings.some((warning) =>
                warning.message.includes('media "anh.png" was not in the upload')
            )
        ).toBe(true);

        const real = await postImport(sheets);
        expect(real.body.created).toBe(1);
        const [row] = await rowsFor("Có media");
        expect(row.media).toBeNull();
    });

    it("uploads a bundled file once, for every row that names it", async () => {
        puts.length = 0;
        const sheets: SheetSpec[] = [
            {
                name: "BUT_PHA",
                rows: [
                    HEADER,
                    ["BP_3", "Media thật", "Đáp án", null, null, "anh.png"],
                    ["BP_4", "Media lặp", "Đáp án", null, null, "media/anh.png"]
                ]
            }
        ];

        const real = await postImport(sheets, {
            files: [{ name: "anh.png", content: PNG, type: "image/png" }]
        });
        expect(real.body.errors).toEqual([]);
        expect(real.body.created).toBe(2);

        const [row] = await rowsFor("Media thật");
        expect(row.media).toMatchObject({ type: "image" });
        expect(row.media?.url).toContain("/oc-test/media/");
        expect(puts).toEqual([expect.stringContaining("/oc-test/media/")]);
        expect(puts).toHaveLength(1);
    });

    it("never touches storage on a dry run", async () => {
        puts.length = 0;
        const sheets: SheetSpec[] = [
            { name: "BUT_PHA", rows: [HEADER, ["BP_5", "Chỉ dry run", "Đáp án", null, null, "anh.png"]] }
        ];

        const dry = await postImport(sheets, {
            dryRun: true,
            files: [{ name: "anh.png", content: PNG, type: "image/png" }]
        });
        expect(dry.body.errors).toEqual([]);
        expect(puts).toHaveLength(0);
    });

    it("accepts the workbook as a raw body, with no files to bundle", async () => {
        const response = await fetch(`${base}/portal/questions/import-excel?dryRun=true`, {
            method: "POST",
            headers: { cookie, "content-type": "application/octet-stream" },
            body: buildXlsx([
                {
                    name: "BUT_PHA",
                    rows: [HEADER, ["BP_9", "Raw body", "Đáp án", null, null, "anh.png"]]
                }
            ])
        });
        const body = (await response.json()) as ImportBody;
        expect(response.status).toBe(200);
        expect(body.total).toBe(1);
        expect(body.warnings[0].message).toContain("was not in the upload");
    });

    it("rejects a bundle that carries media but no workbook", async () => {
        const form = new FormData();
        form.append("media", new Blob([PNG], { type: "image/png" }), "anh.png");

        const response = await fetch(`${base}/portal/questions/import-excel`, {
            method: "POST",
            headers: { cookie },
            body: form
        });
        expect(response.status).toBe(400);
        const body = (await response.json()) as { message: string };
        expect(body.message).toContain('"file" field');
    });
});

describe("a file bigger than the batch cap", () => {
    function rows(prefix: string, count: number, extra: Cell[][] = []): SheetSpec {
        const data: Cell[][] = [HEADER];
        for (let index = 1; index <= count; index += 1) {
            data.push([`${prefix}_${index}`, `Câu hỏi ${prefix} ${index}`, `Đáp án ${index}`, null, null, null]);
        }
        data.push(...extra);
        return { name: "KHOI_DONG", rows: data };
    }

    it("validates and writes in chunks, then reports the whole file as duplicates", async () => {
        const sheet = rows("KD_1", 510);

        const dry = await postImport([sheet], { dryRun: true });
        expect(dry.body.errors).toEqual([]);
        expect(dry.body.total).toBe(510);

        const real = await postImport([sheet]);
        expect(real.status).toBe(200);
        expect(real.body.created).toBe(510);

        const again = await postImport([sheet], { dryRun: true });
        expect(again.body.errors).toHaveLength(510);
        expect(again.body.errors.every((error) => error.code === "DUPLICATE")).toBe(true);
    });

    it("catches a row repeated past the chunk boundary before anything is written", async () => {
        const before = (await bankRows()).length;
        const sheet = rows("KD_4", 510, [["KD_4_999", "Câu hỏi KD_4 10", "Đáp án 10", null, null, null]]);

        const real = await postImport([sheet]);
        expect(real.status).toBe(200);
        expect(real.body.created).toBe(0);
        expect(real.body.stagedBatchId).toBeTruthy();
        expect(real.body.errors).toHaveLength(1);
        expect(real.body.errors[0]).toMatchObject({ index: 510, code: "DUPLICATE" });
        expect(real.body.errors[0].message).toContain("identical to row 10 of this file");
        expect((await bankRows()).length).toBe(before);
    });
});
