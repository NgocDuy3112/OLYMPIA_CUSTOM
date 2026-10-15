import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { CreateTournamentInput } from "../../src/modules/tournaments/index.js";


let app: FastifyInstance;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const validTournament = (slug: string): CreateTournamentInput => ({
    name: "Batch Host",
    slug,
    defaultTags: ["THTH"],
    defaultRounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    defaultFormat: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    defaultPlacementTiers: [{ min: 1, max: 4, points: 10 }]
});

const row = (text: string, tag = "THTH") => ({
    kind: "MC",
    questionText: text,
    tag,
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

async function makeTournament(
    slug: string,
    opts: { visibility?: "PRIVATE" } = {},
    cookie = ownerCookie
): Promise<{ id: string }> {
    const res = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(cookie),
        payload: { ...validTournament(slug), ...(opts.visibility ? { visibility: opts.visibility } : {}) },
    });
    if (res.statusCode !== 201) throw new Error(`tournament create failed: ${res.statusCode} ${res.body}`);
    return res.json();
}

const batchNested = (tournamentId: string, body: object, cookie = ownerCookie) =>
    app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/questions/batch`,
        headers: auth(cookie),
        payload: body,
    });

const batchFlat = (body: object, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: "/portal/questions/batch", headers: auth(cookie), payload: body });

async function countIn(tournamentId: string, cookie = ownerCookie): Promise<number> {
    const res = await app.inject({
        method: "GET",
        url: `/portal/tournaments/${tournamentId}/questions`,
        headers: auth(cookie),
    });
    return res.json().total;
}

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
        const t = await makeTournament("b-auth");

        const anon = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${t.id}/questions/batch`,
            payload: { questions: [row("x")] },
        });
        expect(anon.statusCode).toBe(401);

        expect((await batchNested(t.id, { questions: [row("x")] }, playerCookie)).statusCode).toBe(403);
        expect((await batchFlat({ questions: [row("x")] }, playerCookie)).statusCode).toBe(403);
    });

    it("403 for a non-owner operator, 404 for a PRIVATE parent", async () => {
        const t = await makeTournament("b-auth2");
        const priv = await makeTournament("b-priv", { visibility: "PRIVATE" }, adminCookie);

        expect((await batchNested(t.id, { questions: [row("x")] }, otherCookie)).statusCode).toBe(403);
        expect((await batchNested(priv.id, { questions: [row("x")] }, ownerCookie)).statusCode).toBe(404);
        expect((await batchNested(priv.id, { questions: [row("x")] }, adminCookie)).statusCode).toBe(200);
    });
});


describe("batch import — envelope validation", () => {
    it("400 for an empty array", async () => {
        const t = await makeTournament("b-empty");
        expect((await batchNested(t.id, { questions: [] })).statusCode).toBe(400);
    });

    it("400 when the batch exceeds the cap", async () => {
        const t = await makeTournament("b-cap");
        const oversized = Array.from({ length: 501 }, (_, i) => row(`over ${i}`));
        expect((await batchNested(t.id, { questions: oversized })).statusCode).toBe(400);
    });
});


describe("batch import — dry run", () => {
    it("reports clean and writes nothing", async () => {
        const t = await makeTournament("b-dry-clean");
        const before = await countIn(t.id);

        const res = await batchNested(t.id, { dryRun: true, questions: [row("dry a"), row("dry b")] });

        expect(res.statusCode).toBe(200);
        const report = res.json();
        expect(report).toMatchObject({ dryRun: true, total: 2, created: 0, ids: [], errors: [] });
        expect(await countIn(t.id)).toBe(before);
    });

    it("reports every bad row with its index and writes nothing", async () => {
        const t = await makeTournament("b-dry-bad");
        const before = await countIn(t.id);

        const res = await batchNested(t.id, {
            dryRun: true,
            questions: [
                row("ok"),
                row("bad tag", "NOPE"),
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
        expect(report.errors.map((e: { index: number }) => e.index)).toEqual([1, 3, 4]);
        expect(report.errors.every((e: { code: string }) => e.code === "VALIDATION")).toBe(true);
        expect(report.errors[0].message).toContain("not one of this tournament's tags");
        expect(report.errors[2].details.join(" ")).toContain("unknown option id");
        expect(await countIn(t.id)).toBe(before);
    });
});


describe("batch import — commit", () => {
    it("inserts every row and returns ids for undo", async () => {
        const t = await makeTournament("b-commit");
        const before = await countIn(t.id);

        const res = await batchNested(t.id, { questions: [row("c1"), row("c2"), row("c3")] });

        expect(res.statusCode).toBe(200);
        const report = res.json();
        expect(report).toMatchObject({ dryRun: false, total: 3, created: 3, errors: [] });
        expect(report.ids).toHaveLength(3);
        expect(await countIn(t.id)).toBe(before + 3);
    });

    it("inserts across chunk boundaries", async () => {
        const t = await makeTournament("b-chunks");
        const before = await countIn(t.id);

        const many = Array.from({ length: 150 }, (_, i) => row(`chunk ${i}`));
        const res = await batchNested(t.id, { questions: many });

        expect(res.statusCode).toBe(200);
        expect(res.json().created).toBe(150);
        expect(await countIn(t.id)).toBe(before + 150);
    });

    it("is all-or-nothing: one bad row aborts the whole commit", async () => {
        const t = await makeTournament("b-atomic");
        const before = await countIn(t.id);

        const res = await batchNested(t.id, {
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
        expect(await countIn(t.id)).toBe(before);
    });
});


describe("batch import — duplicates", () => {
    it("flags a repeated row within the batch, naming the earlier index", async () => {
        const t = await makeTournament("b-dupe-batch");
        const before = await countIn(t.id);

        const res = await batchNested(t.id, { questions: [row("twin"), row("unique"), row("twin")] });

        expect(res.statusCode).toBe(400);
        const report = res.json();
        expect(report.created).toBe(0);
        expect(report.errors).toHaveLength(1);
        expect(report.errors[0]).toMatchObject({ index: 2, code: "DUPLICATE" });
        expect(report.errors[0].message).toContain("row 0 of this batch");
        expect(await countIn(t.id)).toBe(before);
    });

    it("flags a duplicate of an existing question, naming its id", async () => {
        const t = await makeTournament("b-dupe-existing");

        const first = await batchNested(t.id, { questions: [row("already here")] });
        const existingId = first.json().ids[0];

        const res = await batchNested(t.id, { questions: [row("already here")] });

        expect(res.statusCode).toBe(400);
        expect(res.json().errors[0]).toMatchObject({ index: 0, code: "DUPLICATE" });
        expect(res.json().errors[0].message).toContain(existingId);
    });

    it("treats the same content in another scope as distinct", async () => {
        const t = await makeTournament("b-scope-iso");
        await batchNested(t.id, { questions: [row("scope twins")] });

        const globalBefore = await countGlobal();
        const res = await batchFlat({ questions: [{ ...row("scope twins"), tag: "GENERAL" }] });

        expect(res.statusCode).toBe(200);
        expect(res.json().created).toBe(1);
        expect(await countGlobal()).toBe(globalBefore + 1);
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
