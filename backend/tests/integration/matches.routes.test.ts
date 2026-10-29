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
    
    rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: {
        competitorsPerMatch: 2,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    placementTiers: [{ min: 1, max: 2, points: 10 }],
    stages: [{ id: "stage-1", title: "Stage 1" }]
});

const roundConfigs = (overrides: Record<string, unknown> = {}) => ({
    r1: {
        allowedKinds: ["MC", "TEXT", "KEYWORD"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "turn-1", mode: "oral", delivery: "sequential" }],
        ...overrides
    }
});

const seats = () => [
    { kind: "user", userId: "00000000-0000-4000-8000-000000000001", seed: 1 },
    { kind: "user", userId: "00000000-0000-4000-8000-000000000002", seed: 2 }
];

const mc = (text: string) => ({
    kind: "MC",
    questionText: text,
    domain: "THTH",
    payload: { options: [{ id: "A", text: "4" }, { id: "B", text: "5" }], correctSet: ["A"] }
});

async function makeTournament(
    name: string,
    opts: { visibility?: "PRIVATE" } = {},
    cookie = ownerCookie
): Promise<{ id: string }> {
    const res = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(cookie),
        payload: { ...validTournament(name), ...(opts.visibility ? { visibility: opts.visibility } : {}) },
    });
    if (res.statusCode !== 201) throw new Error(`tournament: ${res.statusCode} ${res.body}`);
    return res.json();
}

async function makeBankQuestion(text: string, cookie = ownerCookie): Promise<string> {
    const created = await app.inject({
        method: "POST",
        url: `/portal/questions`,
        headers: auth(cookie),
        payload: mc(text),
    });
    if (created.statusCode !== 201) throw new Error(`question: ${created.statusCode} ${created.body}`);

    const id = created.json().id;
    const base = `/portal/questions/${id}/status`;

    await app.inject({ method: "PATCH", url: base, headers: auth(cookie), payload: { status: "PENDING" } });
    await app.inject({ method: "PATCH", url: base, headers: auth(adminCookie), payload: { status: "PUBLISHED" } });
    return id;
}

const matchUrl = (tournamentId: string, suffix = "") =>
    `/portal/tournaments/${tournamentId}/matches${suffix}`;

const createMatch = (tournamentId: string, payload: object, cookie = ownerCookie) =>
    app.inject({
        method: "POST",
        url: matchUrl(tournamentId),
        headers: auth(cookie),
        payload,
    });

const transition = (tournamentId: string, matchId: string, status: string, cookie = ownerCookie) =>
    app.inject({
        method: "PATCH",
        url: matchUrl(tournamentId, `/${matchId}/status`),
        headers: auth(cookie),
        payload: { status },
    });

const matchBody = (overrides: object = {}) => ({
    stageId: "stage-1",
    label: "Match 1",
    scheduledAt: "2026-03-01T10:00:00Z",
    roundConfigs: roundConfigs(),
    ...overrides
});

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "m-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "m-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "m-other", displayName: "Other" },
            { role: "PLAYER", email: "m-player@example.test", displayName: "Player" }
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


describe("matches — authorization", () => {
    it("401 anonymous, 403 for a PLAYER", async () => {
        const s = await makeTournament("m-auth");

        const anon = await app.inject({
            method: "POST",
            url: matchUrl(s.id),
            payload: matchBody(),
        });
        expect(anon.statusCode).toBe(401);

        expect((await createMatch(s.id, matchBody(), playerCookie)).statusCode).toBe(403);
    });

    it("403 for a non-owner operator, 404 for a PRIVATE tournament", async () => {
        const s = await makeTournament("m-auth2");

        expect((await createMatch(s.id, matchBody(), otherCookie)).statusCode).toBe(403);

        const priv = await makeTournament("S", { visibility: "PRIVATE" }, adminCookie);

        expect((await createMatch(priv.id, matchBody(), ownerCookie)).statusCode).toBe(404);
        expect((await createMatch(priv.id, matchBody(), adminCookie)).statusCode).toBe(201);
    });
});


describe("matches — create & validation", () => {
    it("201 with defaults (empty seats and questions)", async () => {
        const s = await makeTournament("m-create");

        const res = await createMatch(s.id, matchBody());

        expect(res.statusCode).toBe(201);
        const body = res.json();
        expect(body.status).toBe("UPCOMING");
        expect(body.players).toEqual([]);
        expect(body.questions).toEqual([]);
        expect(body.live).toBeNull();
    });

    it("201 with a complete seat list, 400 when incomplete or duplicated", async () => {
        const s = await makeTournament("m-seats");

        expect((await createMatch(s.id, matchBody({ players: seats() }))).statusCode).toBe(201);

        const tooFew = await createMatch(s.id, matchBody({ players: [seats()[0]] }));
        expect(tooFew.statusCode).toBe(400);
        expect(tooFew.json().message).toContain("expected 2 seats");

        const dupSeeds = await createMatch(s.id, matchBody({
            players: [
                { kind: "user", userId: "00000000-0000-4000-8000-000000000001", seed: 1 },
                { kind: "user", userId: "00000000-0000-4000-8000-000000000002", seed: 1 }
            ]
        }));
        expect(dupSeeds.statusCode).toBe(400);
        expect(dupSeeds.json().message).toContain("seeds must be unique");

        const wrongKind = await createMatch(s.id, matchBody({
            players: [
                { kind: "team", teamId: "00000000-0000-4000-8000-000000000003", seed: 1 },
                { kind: "user", userId: "00000000-0000-4000-8000-000000000001", seed: 2 }
            ]
        }));
        expect(wrongKind.statusCode).toBe(400);
    });

    it("400 when roundConfigs references an unknown round", async () => {
        const s = await makeTournament("m-rounds");

        const res = await createMatch(s.id, matchBody({
            roundConfigs: { nope: roundConfigs().r1 }
        }));

        expect(res.statusCode).toBe(400);
        expect(res.json().details.join(" ")).toContain("unknown round id");
    });

    it("400 when the scheduledAt is not a date-time", async () => {
        const s = await makeTournament("m-date");

        const res = await createMatch(s.id, matchBody({ scheduledAt: "not-a-date" }));
        expect(res.statusCode).toBe(400);
    });
});


describe("matches — assembly (explicit)", () => {
    it("copies a PUBLISHED bank question with provenance, mode and derived points", async () => {
        const s = await makeTournament("m-asm");
        const sourceId = await makeBankQuestion("assembled question");

        const res = await createMatch(s.id, matchBody({
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
        }));

        expect(res.statusCode).toBe(201);
        const question = res.json().questions[0];
        expect(question.sourceId).toBe(sourceId);
        expect(question.roundId).toBe("r1");
        expect(question.turnId).toBe("turn-1");
        expect(question.mode).toBe("oral");
        expect(question.points).toBe(10);
        expect(question.domain).toBe("THTH");
        expect(question._id).not.toBe(sourceId);
        expect(question.payload.correctSet).toEqual(["A"]);
    });

    it("allows the same bank question twice with distinct _id (khoi-dong pattern)", async () => {
        const s = await makeTournament("m-dup-source");
        const sourceId = await makeBankQuestion("twice in one match");

        const res = await createMatch(s.id, matchBody({
            questions: [
                { roundId: "r1", turnId: "turn-1", sourceId },
                { roundId: "r1", turnId: "turn-1", sourceId }
            ]
        }));

        expect(res.statusCode).toBe(201);
        const [first, second] = res.json().questions;
        expect(first.sourceId).toBe(second.sourceId);
        expect(first._id).not.toBe(second._id);
        expect(first.position).toBe(0);
        expect(second.position).toBe(1);
    });

    it("400 when the bank question is not PUBLISHED", async () => {
        const s = await makeTournament("m-notpub");

        const draft = await app.inject({
            method: "POST",
            url: `/portal/questions`,
            headers: auth(ownerCookie),
            payload: mc("still a draft")
        });

        const res = await createMatch(s.id, matchBody({
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId: draft.json().id }]
        }));

        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("not PUBLISHED");
    });

    it("400 when the kind is not allowed by the round config", async () => {
        const s = await makeTournament("m-kind");
        const sourceId = await makeBankQuestion("an MC question");

        const res = await createMatch(s.id, matchBody({
            roundConfigs: roundConfigs({ allowedKinds: ["TEXT"] }),
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
        }));

        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("not allowed in round");
    });

    it("400 for an unknown turn or round", async () => {
        const s = await makeTournament("m-unknown-turn");
        const sourceId = await makeBankQuestion("turn check");

        const badTurn = await createMatch(s.id, matchBody({
            questions: [{ roundId: "r1", turnId: "turn-9", sourceId }]
        }));
        expect(badTurn.statusCode).toBe(400);
        expect(badTurn.json().message).toContain("is not part of round");

        const badRound = await createMatch(s.id, matchBody({
            questions: [{ roundId: "r9", turnId: "turn-1", sourceId }]
        }));
        expect(badRound.statusCode).toBe(400);
        expect(badRound.json().message).toContain("is not one of this tournament's rounds");
    });
});




describe("matches — re-assembly & freeze", () => {
    it("replaces the question set while UPCOMING", async () => {
        const s = await makeTournament("m-reasm");
        const first = await makeBankQuestion("first pick");
        const second = await makeBankQuestion("second pick");

        const created = await createMatch(s.id, matchBody({
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId: first }]
        }));
        const matchId = created.json().id;

        const res = await app.inject({
            method: "POST",
            url: matchUrl(s.id, `/${matchId}/assemble`),
            headers: auth(ownerCookie),
            payload: { questions: [{ roundId: "r1", turnId: "turn-1", sourceId: second }] }
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().questions).toHaveLength(1);
        expect(res.json().questions[0].sourceId).toBe(second);
    });

    it("derive points from the round's scoring template", async () => {
        const s = await makeTournament("m-points");
        const sourceId = await makeBankQuestion("keyword scoring");

        const created = await createMatch(s.id, matchBody({
            roundConfigs: roundConfigs({ scoring: { template: "keyword_derived", initial: 40, dropPerHint: 5, incorrect: 0 } }),
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
        }));

        expect(created.json().questions[0].points).toBe(40);
    });

    it("freezes content, assembly and deletion once LIVE", async () => {
        const s = await makeTournament("m-freeze");
        const sourceId = await makeBankQuestion("frozen question");

        const created = await createMatch(s.id, matchBody({
            players: seats(),
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
        }));
        const matchId = created.json().id;

        expect((await transition(s.id, matchId, "LIVE")).statusCode).toBe(200);

        const edit = await app.inject({
            method: "PATCH",
            url: matchUrl(s.id, `/${matchId}`),
            headers: auth(ownerCookie),
            payload: { label: "renamed while live" }
        });
        expect(edit.statusCode).toBe(409);
        expect(edit.json().error).toBe("IMMUTABLE");

        const reassemble = await app.inject({
            method: "POST",
            url: matchUrl(s.id, `/${matchId}/assemble`),
            headers: auth(ownerCookie),
            payload: { questions: [{ roundId: "r1", turnId: "turn-1", sourceId }] }
        });
        expect(reassemble.statusCode).toBe(409);

        const remove = await app.inject({
            method: "DELETE",
            url: matchUrl(s.id, `/${matchId}`),
            headers: auth(adminCookie)
        });
        expect(remove.statusCode).toBe(409);
        expect(remove.json().error).toBe("IMMUTABLE");
    });
});


describe("matches — lifecycle", () => {
    it("409 NOT_READY when going LIVE without seats or questions", async () => {
        const s = await makeTournament("m-ready");

        const created = await createMatch(s.id, matchBody());
        const matchId = created.json().id;

        const res = await transition(s.id, matchId, "LIVE");
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_READY");
        expect(res.json().details.join(" ")).toContain("no questions assembled");
    });

    it("goes UPCOMING → LIVE → FINISHED and blocks backward or skipping moves", async () => {
        const s = await makeTournament("m-lifecycle");
        const sourceId = await makeBankQuestion("lifecycle question");

        const created = await createMatch(s.id, matchBody({
            players: seats(),
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
        }));
        const matchId = created.json().id;

        expect((await transition(s.id, matchId, "LIVE")).json().status).toBe("LIVE");
        expect((await transition(s.id, matchId, "FINISHED")).json().status).toBe("FINISHED");

        const backward = await transition(s.id, matchId, "LIVE");
        expect(backward.statusCode).toBe(409);
        expect(backward.json().error).toBe("INVALID_TRANSITION");

        const noop = await transition(s.id, matchId, "FINISHED");
        expect(noop.statusCode).toBe(200);
    });

    it("409 for a skip straight from UPCOMING to FINISHED", async () => {
        const s = await makeTournament("m-skip");
        const created = await createMatch(s.id, matchBody());

        const res = await transition(s.id, created.json().id, "FINISHED");
        expect(res.statusCode).toBe(409);
    });
});


describe("matches — update, delete, list", () => {
    it("updates content while UPCOMING", async () => {
        const s = await makeTournament("m-update");
        const created = await createMatch(s.id, matchBody());

        const res = await app.inject({
            method: "PATCH",
            url: matchUrl(s.id, `/${created.json().id}`),
            headers: auth(ownerCookie),
            payload: { label: "Rescheduled", scheduledAt: "2026-04-01T10:00:00Z" }
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().label).toBe("Rescheduled");
    });

    it("403 for a non-owner operator updating", async () => {
        const s = await makeTournament("m-update403");
        const created = await createMatch(s.id, matchBody());

        const res = await app.inject({
            method: "PATCH",
            url: matchUrl(s.id, `/${created.json().id}`),
            headers: auth(otherCookie),
            payload: { label: "hijack" }
        });
        expect(res.statusCode).toBe(403);
    });

    it("DELETE is ADMIN-only, soft, and hidden afterwards", async () => {
        const s = await makeTournament("m-delete");
        const created = await createMatch(s.id, matchBody());
        const matchId = created.json().id;

        const asOperator = await app.inject({
            method: "DELETE",
            url: matchUrl(s.id, `/${matchId}`),
            headers: auth(ownerCookie)
        });
        expect(asOperator.statusCode).toBe(403);

        const asAdmin = await app.inject({
            method: "DELETE",
            url: matchUrl(s.id, `/${matchId}`),
            headers: auth(adminCookie)
        });
        expect(asAdmin.statusCode).toBe(204);

        const read = await app.inject({
            method: "GET",
            url: matchUrl(s.id, `/${matchId}`),
            headers: auth(ownerCookie)
        });
        expect(read.statusCode).toBe(404);
    });

    it("lists with the pagination envelope and a status filter", async () => {
        const s = await makeTournament("m-list");
        const sourceId = await makeBankQuestion("list question");

        await createMatch(s.id, matchBody({ label: "one" }));
        await createMatch(s.id, matchBody({ label: "two" }));
        const live = await createMatch(s.id, matchBody({
            label: "three",
            players: seats(),
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId }]
        }));
        await transition(s.id, live.json().id, "LIVE");

        const all = await app.inject({
            method: "GET",
            url: matchUrl(s.id),
            headers: auth(ownerCookie)
        });
        expect(Object.keys(all.json()).sort()).toEqual(["items", "limit", "offset", "total"]);
        expect(all.json().total).toBe(3);

        const liveOnly = await app.inject({
            method: "GET",
            url: matchUrl(s.id) + "?status=LIVE",
            headers: auth(ownerCookie)
        });
        expect(liveOnly.json().total).toBe(1);
        expect(liveOnly.json().items[0].label).toBe("three");

        const paged = await app.inject({
            method: "GET",
            url: matchUrl(s.id) + "?limit=1&offset=2",
            headers: auth(ownerCookie)
        });
        expect(paged.json().total).toBe(3);
        expect(paged.json().items).toHaveLength(1);
    });

    it("404 for an unknown match id", async () => {
        const s = await makeTournament("m-404");

        const res = await app.inject({
            method: "GET",
            url: matchUrl(s.id, "/00000000-0000-4000-8000-000000000000"),
            headers: auth(ownerCookie)
        });
        expect(res.statusCode).toBe(404);
    });
});


describe("matches — bank tenancy", () => {
    it("accepts a question tagged for this tournament", async () => {
        const s = await makeTournament("m-global");

        const created = await app.inject({
            method: "POST",
            url: "/portal/questions",
            headers: auth(adminCookie),
            payload: { ...mc("bank question") }
        });
        expect(created.statusCode).toBe(201);

        const globalId = created.json().id;
        await app.inject({
            method: "PATCH",
            url: `/portal/questions/${globalId}/status`,
            headers: auth(adminCookie),
            payload: { status: "PENDING" }
        });
        await app.inject({
            method: "PATCH",
            url: `/portal/questions/${globalId}/status`,
            headers: auth(adminCookie),
            payload: { status: "PUBLISHED" }
        });

        const res = await createMatch(s.id, matchBody({
            questions: [{ roundId: "r1", turnId: "turn-1", sourceId: globalId }]
        }));

        expect(res.statusCode).toBe(201);
        expect(res.json().questions[0].sourceId).toBe(globalId);
    });


});


describe("matches — soft delete visibility", () => {
    it("excludes a deleted match from the list", async () => {
        const s = await makeTournament("m-delist");

        const keep = await createMatch(s.id, matchBody({ label: "keep" }));
        const drop = await createMatch(s.id, matchBody({ label: "drop" }));

        await app.inject({
            method: "DELETE",
            url: matchUrl(s.id, `/${drop.json().id}`),
            headers: auth(adminCookie)
        });

        const list = await app.inject({
            method: "GET",
            url: matchUrl(s.id),
            headers: auth(ownerCookie)
        });

        expect(list.json().total).toBe(1);
        expect(list.json().items[0].id).toBe(keep.json().id);
    });
});
