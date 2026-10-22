import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";


let app: FastifyInstance;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const validTournament = (name: string) => ({
    name,
    tags: ["THTH"],
    rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: {
        competitorsPerMatch: 2,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    placementTiers: [{ min: 1, max: 2, points: 10 }]
});

const row = (text: string, tag = "THTH") => ({
    kind: "MC",
    questionText: text,
    tag,
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

const batchFlat = (body: object, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: "/portal/questions/batch", headers: auth(cookie), payload: body });

async function countGlobal(cookie = ownerCookie): Promise<number> {
    const res = await app.inject({ method: "GET", url: "/portal/questions", headers: auth(cookie) });
    return res.json().total;
}

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "b-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "b-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "b-other", displayName: "Other" },
            { role: "PLAYER", email: "b-player@example.test", displayName: "Player" }
        ])
        .returning({ id: users.id });

    adminCookie = portalCookie(rows[0].id, "ADMIN");
    ownerCookie = portalCookie(rows[1].id, "OPERATOR");
    otherCookie = portalCookie(rows[2].id, "OPERATOR");
    playerCookie = portalCookie(rows[3].id, "PLAYER");
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("batch import — authorization", () => {
    it("401 without a session, 403 for a PLAYER", async () => {

        const anon = await app.inject({
            method: "POST",
            url: `/portal/questions/batch`,
            payload: { questions: [row("x")] },
        });
        expect(anon.statusCode).toBe(401);

        expect((await batchFlat({ questions: [row("x")] }, playerCookie)).statusCode).toBe(403);
        expect((await batchFlat({ questions: [row("x")] }, playerCookie)).statusCode).toBe(403);
    });

    it("201 for any operator — the bank is global", async () => {
        expect((await batchFlat({ questions: [row("x")] }, otherCookie)).statusCode).toBe(200);
    });
});


describe("batch import — envelope validation", () => {
    it("400 for an empty array", async () => {
        expect((await batchFlat({ questions: [] })).statusCode).toBe(400);
    });

    it("400 when the batch exceeds the cap", async () => {
        const oversized = Array.from({ length: 501 }, (_, i) => row(`over ${i}`));
        expect((await batchFlat({ questions: oversized })).statusCode).toBe(400);
    });
});


describe("batch import — dry run", () => {
    it("reports clean and writes nothing", async () => {
        const before = await countGlobal();

        const res = await batchFlat({ dryRun: true, questions: [row("dry a"), row("dry b")] });

        expect(res.statusCode).toBe(200);
        const report = res.json();
        expect(report).toMatchObject({ dryRun: true, total: 2, created: 0, ids: [], errors: [] });
        expect(await countGlobal()).toBe(before);
    });

    it("reports every bad row with its index and writes nothing", async () => {
        const before = await countGlobal();

        const res = await batchFlat({
            dryRun: true,
            questions: [
                row("ok"),
                row("a free tag", "NOPE"),
                row("ok too"),
                { kind: "MC", tag: "THTH" },
                {
                    kind: "MC", questionText: "dangling", tag: "THTH",
                    payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] }
                }
            ]
        });

        expect(res.statusCode).toBe(200);
        const report = res.json();
        expect(report.dryRun).toBe(true);
        expect(report.created).toBe(0);
        expect(report.errors.map((e: { index: number }) => e.index)).toEqual([3, 4]);
        expect(report.errors.every((e: { code: string }) => e.code === "VALIDATION")).toBe(true);
        expect(report.errors[1].details.join(" ")).toContain("unknown option id");
        expect(await countGlobal()).toBe(before);
    });
});


describe("batch import — commit", () => {
    it("inserts every row and returns ids for undo", async () => {
        const before = await countGlobal();

        const res = await batchFlat({ questions: [row("c1"), row("c2"), row("c3")] });

        expect(res.statusCode).toBe(200);
        const report = res.json();
        expect(report).toMatchObject({ dryRun: false, total: 3, created: 3, errors: [] });
        expect(report.ids).toHaveLength(3);
        expect(await countGlobal()).toBe(before + 3);
    });

    it("inserts across chunk boundaries", async () => {
        const before = await countGlobal();

        const many = Array.from({ length: 150 }, (_, i) => row(`chunk ${i}`));
        const res = await batchFlat({ questions: many });

        expect(res.statusCode).toBe(200);
        expect(res.json().created).toBe(150);
        expect(await countGlobal()).toBe(before + 150);
    });

    it("is all-or-nothing: one bad row aborts the whole commit", async () => {
        const before = await countGlobal();

        const res = await batchFlat({
            questions: [row("would be fine"), row("broken payload"), {
                kind: "MC", questionText: "dangling", tag: "THTH",
                payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] }
            }]
        });

        expect(res.statusCode).toBe(400);
        const report = res.json();
        expect(report.created).toBe(0);
        expect(report.ids).toEqual([]);
        expect(report.errors.map((e: { index: number }) => e.index)).toEqual([2]);
        expect(await countGlobal()).toBe(before);
    });
});


describe("batch import — duplicates", () => {
    it("flags a repeated row within the batch, naming the earlier index", async () => {
        const before = await countGlobal();

        const res = await batchFlat({ questions: [row("twin"), row("unique"), row("twin")] });

        expect(res.statusCode).toBe(400);
        const report = res.json();
        expect(report.created).toBe(0);
        expect(report.errors).toHaveLength(1);
        expect(report.errors[0]).toMatchObject({ index: 2, code: "DUPLICATE" });
        expect(report.errors[0].message).toContain("row 0 of this batch");
        expect(await countGlobal()).toBe(before);
    });

    it("flags a duplicate of an existing question, naming its id", async () => {

        const first = await batchFlat({ questions: [row("already here")] });
        const existingId = first.json().ids[0];

        const res = await batchFlat({ questions: [row("already here")] });

        expect(res.statusCode).toBe(400);
        expect(res.json().errors[0]).toMatchObject({ index: 0, code: "DUPLICATE" });
        expect(res.json().errors[0].message).toContain(existingId);
    });

});


describe("batch import — global bank", () => {
    it("imports with free-form tags", async () => {
        const before = await countGlobal();

        const res = await batchFlat({ questions: [row("global one", "GENERAL"), row("global two", "GENERAL")] });

        expect(res.statusCode).toBe(200);
        expect(res.json().created).toBe(2);
        expect(await countGlobal()).toBe(before + 2);
    });
});
