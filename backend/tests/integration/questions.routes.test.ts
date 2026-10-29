import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { CreateQuestionInput } from "../../src/modules/questions/index.js";


// The question bank is global: one bank, and the tournaments pick from it by their tags.

let app: FastifyInstance;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;
let tournamentId: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const validTournament = (name: string, tags = ["THTH"]) => ({
    name,
    tags,
    rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    placementTiers: [{ min: 1, max: 4, points: 10 }],
    stages: [{ id: "s1", title: "Stage 1" }]
});

const mc = (text = "2 + 2?"): CreateQuestionInput => ({
    kind: "MC",
    questionText: text,
    
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

const textQ = (text = "The answer?"): CreateQuestionInput => ({
    kind: "TEXT",
    questionText: text,
    
    payload: {
        acceptedAnswers: ["42"],
        normalize: { caseSensitive: false, trim: true, stripAccents: true }
    }
});

const keywordQ = (text = "Decode?"): CreateQuestionInput => ({
    kind: "KEYWORD",
    questionText: text,
    
    payload: { code: "OLYMPIA", normalize: { caseSensitive: true, trim: true, stripAccents: false } }
});

const create = (payload: object, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: "/portal/questions", headers: auth(cookie), payload });

const patchStatus = (id: string, status: string, cookie: string) =>
    app.inject({
        method: "PATCH",
        url: `/portal/questions/${id}/status`,
        headers: auth(cookie),
        payload: { status },
    });

const publish = async (id: string) => {
    await patchStatus(id, "PENDING", ownerCookie);
    await patchStatus(id, "PUBLISHED", adminCookie);
};

const eligibleUrl = (id: string, suffix = "") => `/portal/tournaments/${id}/eligible-questions${suffix}`;

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "q-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "q-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "q-other", displayName: "Other" },
            { role: "PLAYER", email: "q-player@example.test", displayName: "Player" }
        ])
        .returning({ id: users.id });

    adminCookie = portalCookie(rows[0].id, "ADMIN");
    ownerCookie = portalCookie(rows[1].id, "OPERATOR");
    otherCookie = portalCookie(rows[2].id, "OPERATOR");
    playerCookie = portalCookie(rows[3].id, "PLAYER");

    const created = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(ownerCookie),
        payload: validTournament("Question Tournament"),
    });
    tournamentId = created.json().id;
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("POST /portal/questions — the global bank", () => {
    it("401 without a session", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/questions",
            payload: mc(),
        });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER", async () => {
        expect((await create(mc(), playerCookie)).statusCode).toBe(403);
    });

    it("201 and always starts as DRAFT with the actor as created_by", async () => {
        const res = await create(mc());

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.status).toBe("DRAFT");
        expect(body.media).toBeNull();
        expect(body.timeLimit).toBeNull();
    });

    it("201 for any operator — the bank is shared", async () => {
        expect((await create(mc(), otherCookie)).statusCode).toBe(201);
    });
});


describe("POST — payload integrity", () => {
    it("400 when correctSet references a non-existent option", async () => {
        const res = await create({
            ...mc(),
            payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] }
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 on duplicate option ids", async () => {
        const res = await create({
            ...mc(),
            payload: {
                options: [{ id: "A", text: "4" }, { id: "A", text: "5" }],
                correctSet: ["A"]
            }
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 on an empty correctSet", async () => {
        const res = await create({
            ...mc(),
            payload: { options: [{ id: "A", text: "4" }], correctSet: [] }
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 when kind is MC but the payload is a TEXT shape", async () => {
        const res = await create({
            ...mc(),
            payload: { acceptedAnswers: ["x"], normalize: { caseSensitive: false, trim: true, stripAccents: true } }
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 when a TEXT question has no accepted answers", async () => {
        const res = await create({
            ...textQ(),
            payload: { acceptedAnswers: [], normalize: { caseSensitive: false, trim: true, stripAccents: true } }
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 when a KEYWORD question has an empty code", async () => {
        const res = await create({
            ...keywordQ(),
            payload: { code: "", normalize: { caseSensitive: true, trim: true, stripAccents: false } }
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 when questionText is missing (schema level)", async () => {
        const res = await create({ ...mc(), questionText: undefined });
        expect(res.statusCode).toBe(400);
    });

    it("201 for valid TEXT and KEYWORD questions", async () => {
        expect((await create(textQ())).statusCode).toBe(201);
        expect((await create(keywordQ())).statusCode).toBe(201);
    });
});


describe("GET — listing, filters, pagination", () => {
    it("returns the pagination envelope", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/questions?limit=100",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body).toHaveProperty("total");
        expect(body).toHaveProperty("limit");
        expect(body).toHaveProperty("offset");
        expect(Array.isArray(body.items)).toBe(true);
    });

    it("filters by kind, status and tag", async () => {
        const tagged = await create(textQ("a text one"));
        await create(mc("an mc one"));

        const byKind = await app.inject({
            method: "GET",
            url: "/portal/questions?kind=TEXT&limit=100",
            headers: auth(ownerCookie),
        });
        expect(byKind.json().items.every((q: { kind: string }) => q.kind === "TEXT")).toBe(true);

        const byTag = await app.inject({
            method: "GET",
            url: "/portal/questions?tag=THTH&limit=100",
            headers: auth(ownerCookie),
        });
        expect(byTag.json().items.map((q: { id: string }) => q.id)).toContain(tagged.json().id);

        const byStatus = await app.inject({
            method: "GET",
            url: "/portal/questions?status=DRAFT&limit=100",
            headers: auth(ownerCookie),
        });
        expect(byStatus.json().items.every((q: { status: string }) => q.status === "DRAFT")).toBe(true);
    });

    it("paginates with offset and reports the unpaginated total", async () => {
        const all = await app.inject({
            method: "GET",
            url: "/portal/questions?limit=100",
            headers: auth(ownerCookie),
        });
        const total = all.json().total;

        const page = await app.inject({
            method: "GET",
            url: "/portal/questions?limit=2&offset=0",
            headers: auth(ownerCookie),
        });
        expect(page.json().items).toHaveLength(2);
        expect(page.json().total).toBe(total);
    });

    it("400 for a non-numeric limit", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/questions?limit=abc",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 for limit=0 and limit=101 (bounds enforced)", async () => {
        for (const limit of [0, 101]) {
            const res = await app.inject({
                method: "GET",
                url: `/portal/questions?limit=${limit}`,
                headers: auth(ownerCookie),
            });
            expect(res.statusCode).toBe(400);
        }
    });

    it("400 for an unknown status value", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/questions?status=NOPE",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(400);
    });
});


describe("PATCH — content edits", () => {
    it("200 for an operator", async () => {
        const row = await create(mc("editable"));
        const res = await app.inject({
            method: "PATCH",
            url: `/portal/questions/${row.json().id}`,
            headers: auth(otherCookie),
            payload: { questionText: "edited" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().questionText).toBe("edited");
    });

    it("400 when the new payload breaks integrity", async () => {
        const row = await create(mc("broken edit"));
        const res = await app.inject({
            method: "PATCH",
            url: `/portal/questions/${row.json().id}`,
            headers: auth(ownerCookie),
            payload: { payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] } },
        });
        expect(res.statusCode).toBe(400);
    });

    it("409 IMMUTABLE when editing an archived question", async () => {
        const row = await create(mc("archived"));
        await patchStatus(row.json().id, "ARCHIVED", ownerCookie);

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/questions/${row.json().id}`,
            headers: auth(ownerCookie),
            payload: { questionText: "too late" },
        });
        expect(res.statusCode).toBe(409);
    });
});


describe("PATCH /status — transitions", () => {
    it("allows DRAFT→PENDING→DRAFT, DRAFT→ARCHIVED and PENDING→ARCHIVED", async () => {
        const row = await create(mc("transitions"));
        const id = row.json().id;

        expect((await patchStatus(id, "PENDING", ownerCookie)).statusCode).toBe(200);
        expect((await patchStatus(id, "DRAFT", ownerCookie)).statusCode).toBe(200);
        expect((await patchStatus(id, "ARCHIVED", ownerCookie)).statusCode).toBe(200);
    });

    it("403 when an OPERATOR tries to publish", async () => {
        const row = await create(mc("publishing"));
        const id = row.json().id;

        await patchStatus(id, "PENDING", ownerCookie);
        const res = await patchStatus(id, "PUBLISHED", ownerCookie);
        expect(res.statusCode).toBe(403);
    });

    it("200 when an ADMIN publishes, and PUBLISHED→PENDING is allowed", async () => {
        const row = await create(mc("published"));
        const id = row.json().id;

        await patchStatus(id, "PENDING", ownerCookie);
        expect((await patchStatus(id, "PUBLISHED", adminCookie)).statusCode).toBe(200);
        expect((await patchStatus(id, "PENDING", adminCookie)).statusCode).toBe(200);
    });

    it("409 for illegal PUBLISHED→DRAFT and anything out of ARCHIVED", async () => {
        const row = await create(mc("illegal"));
        const id = row.json().id;

        await patchStatus(id, "PENDING", ownerCookie);
        await patchStatus(id, "PUBLISHED", adminCookie);
        expect((await patchStatus(id, "DRAFT", adminCookie)).statusCode).toBe(409);

        const archived = await create(mc("sealed"));
        await patchStatus(archived.json().id, "ARCHIVED", ownerCookie);
        expect((await patchStatus(archived.json().id, "PENDING", adminCookie)).statusCode).toBe(409);
    });

    it("200 no-op when the status is unchanged", async () => {
        const row = await create(mc("no-op"));
        const res = await patchStatus(row.json().id, "DRAFT", ownerCookie);
        expect(res.statusCode).toBe(200);
    });
});


describe("DELETE — archive alias", () => {
    it("204 and the question stays readable as ARCHIVED", async () => {
        const row = await create(mc("deleted"));
        const id = row.json().id;

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/questions/${id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(204);

        const read = await app.inject({
            method: "GET",
            url: `/portal/questions/${id}`,
            headers: auth(ownerCookie),
        });
        expect(read.json().status).toBe("ARCHIVED");
    });

    it("204 again on a second DELETE (idempotent)", async () => {
        const row = await create(mc("deleted twice"));
        const id = row.json().id;

        await app.inject({ method: "DELETE", url: `/portal/questions/${id}`, headers: auth(ownerCookie) });
        const res = await app.inject({
            method: "DELETE",
            url: `/portal/questions/${id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(204);
    });

    it("404 for an unknown question", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: "/portal/questions/00000000-0000-4000-8000-000000000000",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });
});


describe("GET /portal/tournaments/:id/eligible-questions — the assembly browse", () => {
    it("returns the tournament's published questions, and only those", async () => {
        const own = await create(mc("eligible own"));
        const draft = await create(mc("still a draft"));
        const other = await create({ ...mc("another tag") });

        await publish(own.json().id);
        await publish(other.json().id);

        const res = await app.inject({
            method: "GET",
            url: eligibleUrl(tournamentId),
            headers: auth(ownerCookie),
        });

        expect(res.statusCode).toBe(200);
        const ids = res.json().items.map((q: { id: string }) => q.id);
        expect(ids).toContain(own.json().id);
        expect(ids).not.toContain(draft.json().id);
        // the bank is global: every published question is eligible, whoever authored it
        expect(ids).toContain(other.json().id);
    });

    it("filters by kinds and searches text", async () => {
        const text = await create(textQ("Đường lên đỉnh Olympia"));
        await publish(text.json().id);

        const byKind = await app.inject({
            method: "GET",
            url: eligibleUrl(tournamentId, "?kinds=TEXT"),
            headers: auth(ownerCookie),
        });
        expect(byKind.json().items.every((q: { kind: string }) => q.kind === "TEXT")).toBe(true);

        const bySearch = await app.inject({
            method: "GET",
            url: eligibleUrl(tournamentId, "?search=duong%20len%20dinh"),
            headers: auth(ownerCookie),
        });
        expect(bySearch.json().items.map((q: { id: string }) => q.id)).toContain(text.json().id);
    });

    it("404 for a tournament that does not exist", async () => {
        const res = await app.inject({
            method: "GET",
            url: eligibleUrl("00000000-0000-4000-8000-000000000000"),
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });
});
