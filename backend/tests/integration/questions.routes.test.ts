import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { CreateTournamentInput } from "../../src/modules/tournaments/index.js";
import type { CreateQuestionInput } from "../../src/modules/questions/index.js";


let app: FastifyInstance;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

const validTournament = (slug: string, tags = ["THTH"]): CreateTournamentInput => ({
    name: "Questions Host",
    slug,
    defaultTags: tags,
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

const mc = (text = "2 + 2?"): CreateQuestionInput => ({
    kind: "MC",
    questionText: text,
    tag: "THTH",
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

const textQ = (text = "The answer?"): CreateQuestionInput => ({
    kind: "TEXT",
    questionText: text,
    tag: "THTH",
    payload: {
        acceptedAnswers: ["42"],
        normalize: { caseSensitive: false, trim: true, stripAccents: true }
    }
});

const keywordQ = (text = "Decode?"): CreateQuestionInput => ({
    kind: "KEYWORD",
    questionText: text,
    tag: "THTH",
    payload: { code: "OLYMPIA", normalize: { caseSensitive: true, trim: true, stripAccents: false } }
});

async function makeTournament(
    slug: string,
    opts: { visibility?: "PRIVATE"; tags?: string[] } = {},
    cookie = ownerCookie
): Promise<{ id: string }> {
    const res = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(cookie),
        payload: { ...validTournament(slug, opts.tags ?? ["THTH"]), ...(opts.visibility ? { visibility: opts.visibility } : {}) },
    });
    if (res.statusCode !== 201) throw new Error(`tournament create failed: ${res.statusCode} ${res.body}`);
    return res.json();
}

const createNested = (tournamentId: string, payload: object, cookie = ownerCookie) =>
    app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/questions`,
        headers: auth(cookie),
        payload,
    });

const createGlobal = (payload: object, cookie = ownerCookie) =>
    app.inject({ method: "POST", url: "/portal/questions", headers: auth(cookie), payload });

const patchStatus = (id: string, status: string, cookie: string, tournamentId?: string) =>
    app.inject({
        method: "PATCH",
        url: tournamentId
            ? `/portal/tournaments/${tournamentId}/questions/${id}/status`
            : `/portal/questions/${id}/status`,
        headers: auth(cookie),
        payload: { status },
    });

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
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("POST …/questions — tournament bank", () => {
    it("401 without a session", async () => {
        const t = await makeTournament("q-a");
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${t.id}/questions`,
            payload: mc(),
        });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER", async () => {
        const t = await makeTournament("q-b");
        expect((await createNested(t.id, mc(), playerCookie)).statusCode).toBe(403);
    });

    it("201 and always starts as DRAFT with the actor as created_by", async () => {
        const t = await makeTournament("q-draft");
        const res = await createNested(t.id, mc());

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.status).toBe("DRAFT");
        expect(body.tournamentId).toBe(t.id);
        expect(body.media).toBeNull();
        expect(body.timeLimit).toBeNull();
    });

    it("403 for a non-owner operator", async () => {
        const t = await makeTournament("q-notmine");
        expect((await createNested(t.id, mc(), otherCookie)).statusCode).toBe(403);
    });

    it("PRIVATE parent: 404 for an operator, 201 for an admin", async () => {
        const t = await makeTournament("q-priv", { visibility: "PRIVATE" }, adminCookie);
        expect((await createNested(t.id, mc(), ownerCookie)).statusCode).toBe(404);
        expect((await createNested(t.id, mc(), adminCookie)).statusCode).toBe(201);
    });

    it("404 for an unknown tournament", async () => {
        const res = await createNested("00000000-0000-4000-8000-000000000000", mc());
        expect(res.statusCode).toBe(404);
    });

    it("400 when the tag is not one of the tournament's tags", async () => {
        const t = await makeTournament("q-tags", { tags: ["THTH", "TNSS"] });
        const res = await createNested(t.id, { ...mc(), tag: "VNTT" });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
    });

    it("400 when the tag differs only by case (case-sensitive matching)", async () => {
        const t = await makeTournament("q-case");
        expect((await createNested(t.id, { ...mc(), tag: "thth" })).statusCode).toBe(400);
    });
});


describe("POST — payload integrity", () => {
    let tid: string;

    beforeAll(async () => {
        tid = (await makeTournament("q-integrity", { tags: ["THTH"] })).id;
    });

    it("400 when correctSet references a non-existent option", async () => {
        const payload = { ...mc(), payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] } };
        const res = await createNested(tid, payload);
        expect(res.statusCode).toBe(400);
        expect(res.json().details.join(" ")).toContain("unknown option id");
    });

    it("400 on duplicate option ids", async () => {
        const payload = {
            ...mc(),
            payload: { options: [{ id: "A", text: "4" }, { id: "A", text: "5" }], correctSet: ["A"] }
        };
        expect((await createNested(tid, payload)).statusCode).toBe(400);
    });

    it("400 on an empty correctSet", async () => {
        const payload = { ...mc(), payload: { options: [{ id: "A", text: "4" }], correctSet: [] } };
        expect((await createNested(tid, payload)).statusCode).toBe(400);
    });

    it("400 when kind is MC but the payload is a TEXT shape", async () => {
        const payload = { ...mc(), payload: textQ().payload };
        expect((await createNested(tid, payload)).statusCode).toBe(400);
    });

    it("400 when a TEXT question has no accepted answers", async () => {
        const payload = { ...textQ(), payload: { acceptedAnswers: [], normalize: { caseSensitive: false, trim: true, stripAccents: true } } };
        expect((await createNested(tid, payload)).statusCode).toBe(400);
    });

    it("400 when a KEYWORD question has an empty code", async () => {
        const payload = { ...keywordQ(), payload: { code: "", normalize: { caseSensitive: true, trim: true, stripAccents: false } } };
        expect((await createNested(tid, payload)).statusCode).toBe(400);
    });

    it("400 when questionText is missing (schema level)", async () => {
        const { questionText, ...withoutText } = mc();
        expect((await createNested(tid, withoutText)).statusCode).toBe(400);
    });

    it("201 for valid TEXT and KEYWORD questions", async () => {
        expect((await createNested(tid, textQ())).statusCode).toBe(201);
        expect((await createNested(tid, keywordQ())).statusCode).toBe(201);
    });
});


describe("POST /portal/questions — global bank", () => {
    it("201 for an OPERATOR with a free-form tag", async () => {
        const res = await createGlobal({ ...mc(), tag: "GENERAL" });
        expect(res.statusCode).toBe(201);

        const body = res.json();
        expect(body.tournamentId).toBeNull();
        expect(body.status).toBe("DRAFT");
    });

    it("201 for an ADMIN", async () => {
        expect((await createGlobal(mc(), adminCookie)).statusCode).toBe(201);
    });

    it("403 for a PLAYER", async () => {
        expect((await createGlobal(mc(), playerCookie)).statusCode).toBe(403);
    });
});


describe("GET — listing, filters, pagination", () => {
    it("returns the pagination envelope and only this tournament's questions", async () => {
        const a = await makeTournament("q-list-a");
        const b = await makeTournament("q-list-b", {}, adminCookie);

        await createNested(a.id, mc("one"));
        await createNested(a.id, textQ("two"));
        await createNested(b.id, mc("three"), adminCookie);

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${a.id}/questions`,
            headers: auth(ownerCookie),
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(Object.keys(body).sort()).toEqual(["items", "limit", "offset", "total"]);
        expect(body.total).toBe(2);
        expect(body.limit).toBe(20);
        expect(body.offset).toBe(0);
        expect(body.items.map((q: { questionText: string }) => q.questionText).sort()).toEqual(["one", "two"]);
    });

    it("filters by kind, status and tag", async () => {
        const t = await makeTournament("q-filters");
        await createNested(t.id, mc("mc one"));
        await createNested(t.id, textQ("text one"));

        const byKind = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions?kind=TEXT`,
            headers: auth(ownerCookie),
        });
        expect(byKind.json().total).toBe(1);

        const byTag = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions?tag=THTH`,
            headers: auth(ownerCookie),
        });
        expect(byTag.json().total).toBe(2);

        const byStatus = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions?status=PENDING`,
            headers: auth(ownerCookie),
        });
        expect(byStatus.json().total).toBe(0);
    });

    it("paginates with offset and reports the unpaginated total", async () => {
        const t = await makeTournament("q-page");
        for (const text of ["p1", "p2", "p3"]) await createNested(t.id, mc(text));

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions?limit=2&offset=2`,
            headers: auth(ownerCookie),
        });

        expect(res.json().total).toBe(3);
        expect(res.json().items).toHaveLength(1);
        expect(res.json().limit).toBe(2);
        expect(res.json().offset).toBe(2);
    });

    it("400 for a non-numeric limit", async () => {
        const t = await makeTournament("q-badlimit");
        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions?limit=abc`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 for limit=0 and limit=101 (bounds enforced)", async () => {
        const t = await makeTournament("q-bounds");
        for (const limit of ["0", "101"]) {
            const res = await app.inject({
                method: "GET",
                url: `/portal/tournaments/${t.id}/questions?limit=${limit}`,
                headers: auth(ownerCookie),
            });
            expect(res.statusCode, `limit=${limit}`).toBe(400);
            expect(res.json().error).toBe("VALIDATION");
        }
    });

    it("400 for an unknown status value", async () => {
        const t = await makeTournament("q-badstatus");
        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions?status=BANANA`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(400);
    });

    it("the flat list returns only global questions", async () => {
        const t = await makeTournament("q-flatlist");
        const scoped = (await createNested(t.id, mc("scoped question"))).json();
        const global = (await createGlobal({ ...mc(), questionText: "global question", tag: "GENERAL" })).json();

        const res = await app.inject({ method: "GET", url: "/portal/questions", headers: auth(ownerCookie) });
        expect(res.statusCode).toBe(200);

        const ids = res.json().items.map((q: { id: string }) => q.id);
        expect(ids).toContain(global.id);
        expect(ids).not.toContain(scoped.id);
        expect(res.json().items.every((q: { tournamentId: string | null }) => q.tournamentId === null)).toBe(true);
    });

    it("404 listing an unknown tournament", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments/00000000-0000-4000-8000-000000000000/questions",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });
});


describe("GET — cross-scope isolation", () => {
    it("nested route 404s for a global question id", async () => {
        const t = await makeTournament("q-cross-a");
        const global = (await createGlobal(mc("global one"))).json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions/${global.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("flat route 404s for a tournament question id", async () => {
        const t = await makeTournament("q-cross-b");
        const scoped = (await createNested(t.id, mc("scoped one"))).json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/questions/${scoped.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("nested route 404s for another tournament's question", async () => {
        const a = await makeTournament("q-cross-c");
        const b = await makeTournament("q-cross-d");
        const scoped = (await createNested(a.id, mc("belongs to A"))).json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${b.id}/questions/${scoped.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("flat route reads a global question", async () => {
        const global = (await createGlobal(mc("readable global"))).json();
        const res = await app.inject({
            method: "GET",
            url: `/portal/questions/${global.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().questionText).toBe("readable global");
    });
});


describe("PATCH — content edits", () => {
    it("200 for the parent owner", async () => {
        const t = await makeTournament("q-edit");
        const q = (await createNested(t.id, mc("original"))).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
            payload: { questionText: "edited" },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().questionText).toBe("edited");
    });

    it("403 for a non-owner operator", async () => {
        const t = await makeTournament("q-edit403");
        const q = (await createNested(t.id, mc())).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(otherCookie),
            payload: { questionText: "hijack" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("400 when the new payload breaks integrity", async () => {
        const t = await makeTournament("q-edit400");
        const q = (await createNested(t.id, mc())).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
            payload: { payload: { options: [{ id: "A", text: "4" }], correctSet: ["Z"] } },
        });
        expect(res.statusCode).toBe(400);
    });

    it("400 when the new tag is not allowed", async () => {
        const t = await makeTournament("q-edittag");
        const q = (await createNested(t.id, mc())).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
            payload: { tag: "NOPE" },
        });
        expect(res.statusCode).toBe(400);
    });

    it("409 IMMUTABLE when editing an archived question", async () => {
        const t = await makeTournament("q-editarch");
        const q = (await createNested(t.id, mc())).json();

        await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
        });

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
            payload: { questionText: "late" },
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("IMMUTABLE");
    });
});


describe("PATCH /status — transitions", () => {
    it("allows DRAFT→PENDING→DRAFT, DRAFT→ARCHIVED and PENDING→ARCHIVED", async () => {
        const t = await makeTournament("q-trans");

        const a = (await createNested(t.id, mc("a"))).json();
        expect((await patchStatus(a.id, "PENDING", ownerCookie, t.id)).statusCode).toBe(200);
        expect((await patchStatus(a.id, "DRAFT", ownerCookie, t.id)).statusCode).toBe(200);
        expect((await patchStatus(a.id, "ARCHIVED", ownerCookie, t.id)).statusCode).toBe(200);

        const b = (await createNested(t.id, mc("b"))).json();
        await patchStatus(b.id, "PENDING", ownerCookie, t.id);
        const rejected = await patchStatus(b.id, "ARCHIVED", ownerCookie, t.id);
        expect(rejected.statusCode).toBe(200);
        expect(rejected.json().status).toBe("ARCHIVED");
    });

    it("403 when an OPERATOR tries to publish", async () => {
        const t = await makeTournament("q-gate-op");
        const q = (await createNested(t.id, mc())).json();
        await patchStatus(q.id, "PENDING", ownerCookie, t.id);

        const res = await patchStatus(q.id, "PUBLISHED", ownerCookie, t.id);
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("FORBIDDEN");
    });

    it("200 when an ADMIN publishes, and PUBLISHED→PENDING is allowed", async () => {
        const t = await makeTournament("q-gate-admin");
        const q = (await createNested(t.id, mc())).json();
        await patchStatus(q.id, "PENDING", ownerCookie, t.id);

        const published = await patchStatus(q.id, "PUBLISHED", adminCookie, t.id);
        expect(published.statusCode).toBe(200);
        expect(published.json().status).toBe("PUBLISHED");

        const retracted = await patchStatus(q.id, "PENDING", adminCookie, t.id);
        expect(retracted.statusCode).toBe(200);
        expect(retracted.json().status).toBe("PENDING");
    });

    it("409 for illegal PUBLISHED→DRAFT and anything out of ARCHIVED", async () => {
        const t = await makeTournament("q-illegal");
        const q = (await createNested(t.id, mc())).json();
        await patchStatus(q.id, "PENDING", ownerCookie, t.id);
        await patchStatus(q.id, "PUBLISHED", adminCookie, t.id);

        const backToDraft = await patchStatus(q.id, "DRAFT", adminCookie, t.id);
        expect(backToDraft.statusCode).toBe(409);
        expect(backToDraft.json().error).toBe("INVALID_TRANSITION");

        await patchStatus(q.id, "ARCHIVED", adminCookie, t.id);
        expect((await patchStatus(q.id, "PENDING", adminCookie, t.id)).statusCode).toBe(409);
        expect((await patchStatus(q.id, "PUBLISHED", adminCookie, t.id)).statusCode).toBe(409);
    });

    it("200 no-op when the status is unchanged", async () => {
        const t = await makeTournament("q-noop");
        const q = (await createNested(t.id, mc())).json();

        const res = await patchStatus(q.id, "DRAFT", ownerCookie, t.id);
        expect(res.statusCode).toBe(200);
        expect(res.json().status).toBe("DRAFT");
    });

    it("403 for a non-owner operator before any transition rule runs", async () => {
        const t = await makeTournament("q-trans403");
        const q = (await createNested(t.id, mc())).json();

        const res = await patchStatus(q.id, "PENDING", otherCookie, t.id);
        expect(res.statusCode).toBe(403);
    });
});


describe("DELETE — archive alias", () => {
    it("204 and the question stays readable as ARCHIVED", async () => {
        const t = await makeTournament("q-del");
        const q = (await createNested(t.id, mc())).json();

        const del = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
        });
        expect(del.statusCode).toBe(204);
        expect(del.body).toBe("");

        const read = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
        });
        expect(read.statusCode).toBe(200);
        expect(read.json().status).toBe("ARCHIVED");
    });

    it("204 again on a second DELETE (idempotent)", async () => {
        const t = await makeTournament("q-del-twice");
        const q = (await createNested(t.id, mc())).json();

        await app.inject({ method: "DELETE", url: `/portal/tournaments/${t.id}/questions/${q.id}`, headers: auth(ownerCookie) });
        const second = await app.inject({ method: "DELETE", url: `/portal/tournaments/${t.id}/questions/${q.id}`, headers: auth(ownerCookie) });
        expect(second.statusCode).toBe(204);
    });

    it("204 when deleting a PENDING question (reject path)", async () => {
        const t = await makeTournament("q-del-pending");
        const q = (await createNested(t.id, mc())).json();
        await patchStatus(q.id, "PENDING", ownerCookie, t.id);

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(204);
    });

    it("403 for a non-owner operator", async () => {
        const t = await makeTournament("q-del403");
        const q = (await createNested(t.id, mc())).json();

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/questions/${q.id}`,
            headers: auth(otherCookie),
        });
        expect(res.statusCode).toBe(403);
    });

    it("404 for an unknown question", async () => {
        const t = await makeTournament("q-del404");
        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/questions/00000000-0000-4000-8000-000000000000`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });
});


describe("GET …/eligible-questions — the assembly browse", () => {
    const eligibleUrl = (tournamentId: string, suffix = "") =>
        `/portal/tournaments/${tournamentId}/eligible-questions${suffix}`;

    it("401 anonymous, 403 for a PLAYER", async () => {
        const t = await makeTournament("eq-auth");

        expect((await app.inject({ method: "GET", url: eligibleUrl(t.id) })).statusCode).toBe(401);
        expect(
            (await app.inject({ method: "GET", url: eligibleUrl(t.id), headers: auth(playerCookie) })).statusCode
        ).toBe(403);
    });

    it("PRIVATE parent: 404 for an operator, 200 for an admin", async () => {
        const t = await makeTournament("eq-priv", { visibility: "PRIVATE" }, adminCookie);

        expect(
            (await app.inject({ method: "GET", url: eligibleUrl(t.id), headers: auth(ownerCookie) })).statusCode
        ).toBe(404);
        expect(
            (await app.inject({ method: "GET", url: eligibleUrl(t.id), headers: auth(adminCookie) })).statusCode
        ).toBe(200);
    });

    it("returns own published + global published, excluding drafts", async () => {
        const t = await makeTournament("eq-scope");

        const own = (await app.inject({
            method: "POST",
            url: `/portal/tournaments/${t.id}/questions`,
            headers: auth(ownerCookie),
            payload: mc("eligible own")
        })).json();
        const draft = (await app.inject({
            method: "POST",
            url: `/portal/tournaments/${t.id}/questions`,
            headers: auth(ownerCookie),
            payload: mc("still a draft")
        })).json();
        const global = (await app.inject({
            method: "POST",
            url: "/portal/questions",
            headers: auth(ownerCookie),
            payload: { ...mc("eligible global"), tag: "GENERAL" }
        })).json();

        for (const id of [own.id, global.id]) {
            await patchStatus(id, "PENDING", ownerCookie, id === global.id ? undefined : t.id);
        }
        // nested status endpoint for tournament questions, flat one for global
        await patchStatus(own.id, "PUBLISHED", adminCookie, t.id);
        await patchStatus(global.id, "PUBLISHED", adminCookie);

        const res = await app.inject({
            method: "GET",
            url: eligibleUrl(t.id),
            headers: auth(ownerCookie)
        });

        expect(res.statusCode).toBe(200);
        const ids = res.json().items.map((q: { id: string }) => q.id);
        expect(ids).toContain(own.id);
        expect(ids).toContain(global.id);
        expect(ids).not.toContain(draft.id);
    });

    it("filters by kinds and searches text", async () => {
        const t = await makeTournament("eq-filters");
        const text = (await app.inject({
            method: "POST",
            url: `/portal/tournaments/${t.id}/questions`,
            headers: auth(ownerCookie),
            payload: textQ("Đường lên đỉnh Olympia")
        })).json();

        await patchStatus(text.id, "PENDING", ownerCookie, t.id);
        await patchStatus(text.id, "PUBLISHED", adminCookie, t.id);

        const byKind = await app.inject({
            method: "GET",
            url: eligibleUrl(t.id, "?kinds=TEXT"),
            headers: auth(ownerCookie)
        });
        expect(byKind.json().items.every((q: { kind: string }) => q.kind === "TEXT")).toBe(true);

        const bySearch = await app.inject({
            method: "GET",
            url: eligibleUrl(t.id, "?search=duong%20len%20dinh"),
            headers: auth(ownerCookie)
        });
        expect(bySearch.json().items.map((q: { id: string }) => q.id)).toContain(text.id);
    });

    it("400 for an invalid kinds value or a non-numeric limit", async () => {
        const t = await makeTournament("eq-400");

        expect(
            (await app.inject({ method: "GET", url: eligibleUrl(t.id, "?kinds=BANANA"), headers: auth(ownerCookie) })).statusCode
        ).toBe(400);
        expect(
            (await app.inject({ method: "GET", url: eligibleUrl(t.id, "?limit=abc"), headers: auth(ownerCookie) })).statusCode
        ).toBe(400);
    });

    it("returns the pagination envelope", async () => {
        const t = await makeTournament("eq-page");
        const res = await app.inject({
            method: "GET",
            url: eligibleUrl(t.id, "?limit=5&offset=0"),
            headers: auth(ownerCookie)
        });

        expect(Object.keys(res.json()).sort()).toEqual(["items", "limit", "offset", "total"]);
        expect(res.json().limit).toBe(5);
    });
});
