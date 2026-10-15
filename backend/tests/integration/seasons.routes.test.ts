import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { CreateTournamentInput } from "../../src/modules/tournaments/index.js";
import type { CreateSeasonInput } from "../../src/modules/seasons/index.js";


let app: FastifyInstance;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const validTournament = (slug: string): CreateTournamentInput => ({
    name: "Seasons Host",
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

const validSeason = (name = "Season 1"): CreateSeasonInput => ({
    name,
    stages: [
        { id: "s1", title: "Qualifiers", start: "2026-01-01T00:00:00Z", end: "2026-06-01T00:00:00Z" }
    ]
});

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

async function makeTournament(
    slug: string,
    opts: { visibility?: "PRIVATE" } = {},
    cookie = ownerCookie
): Promise<{ id: string }> {
    const res = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(cookie),
        payload: { ...validTournament(slug), ...opts },
    });
    if (res.statusCode !== 201) {
        throw new Error(`tournament create failed: ${res.statusCode} ${res.body}`);
    }
    return res.json();
}

async function makeSeason(
    tournamentId: string,
    payload: CreateSeasonInput = validSeason(),
    cookie = ownerCookie
) {
    return app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/seasons`,
        headers: auth(cookie),
        payload,
    });
}

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "sea-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "sea-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "sea-other", displayName: "Other" },
            { role: "PLAYER", email: "sea-player@example.test", displayName: "Player" }
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


describe("POST …/seasons — create", () => {
    it("401 without a session", async () => {
        const t = await makeTournament("sea-a");
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${t.id}/seasons`,
            payload: validSeason(),
        });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER", async () => {
        const t = await makeTournament("sea-b");
        const res = await makeSeason(t.id, validSeason(), playerCookie);
        expect(res.statusCode).toBe(403);
    });

    it("201 + inherits rounds/format/placementTiers from the tournament", async () => {
        const t = await makeTournament("sea-inherit");
        const res = await makeSeason(t.id);
        expect(res.statusCode).toBe(201);

        const body = res.json();
        expect(body.name).toBe("Season 1");
        expect(body.rounds).toEqual(validTournament("x").defaultRounds);
        expect(body.format).toEqual(validTournament("x").defaultFormat);
        expect(body.placementTiers).toEqual(validTournament("x").defaultPlacementTiers);
        expect(body.current).toBe(false);
        expect(body.deletedAt).toBeNull();
    });

    it("201 + explicit override wins over inherited defaults", async () => {
        const t = await makeTournament("sea-override");
        const customRounds = [{ id: "custom", name: "Custom Round", order: 0, chart: "line" }];

        const res = await makeSeason(t.id, { ...validSeason(), rounds: customRounds });
        expect(res.statusCode).toBe(201);
        expect(res.json().rounds).toEqual(customRounds);
        expect(res.json().format).toEqual(validTournament("x").defaultFormat);
    });

    it("400 when name is missing (schema validation)", async () => {
        const t = await makeTournament("sea-invalid");
        const res = await makeSeason(t.id, { stages: [] } as never);
        expect(res.statusCode).toBe(400);
    });

    it("404 for an unknown tournament", async () => {
        const res = await makeSeason("00000000-0000-4000-8000-000000000000");
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: "NOT_FOUND" });
    });

    it("404 under a soft-deleted tournament", async () => {
        const t = await makeTournament("sea-gone");
        await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}`,
            headers: auth(adminCookie),
        });

        const res = await makeSeason(t.id);
        expect(res.statusCode).toBe(404);
    });

    it("403 for a non-owner operator on a PUBLIC tournament", async () => {
        const t = await makeTournament("sea-notmine");
        const res = await makeSeason(t.id, validSeason(), otherCookie);
        expect(res.statusCode).toBe(403);
    });

    it("201 for an ADMIN on someone else's tournament", async () => {
        const t = await makeTournament("sea-admincreate");
        const res = await makeSeason(t.id, validSeason(), adminCookie);
        expect(res.statusCode).toBe(201);
    });

    it("PRIVATE parent: 404 for an operator, 201 for an admin", async () => {
        const t = await makeTournament("sea-priv", { visibility: "PRIVATE" }, adminCookie);

        const denied = await makeSeason(t.id, validSeason(), ownerCookie);
        expect(denied.statusCode).toBe(404);

        const allowed = await makeSeason(t.id, validSeason(), adminCookie);
        expect(allowed.statusCode).toBe(201);
    });
});


describe("current flag — auto-managed siblings", () => {
    it("creating a new current season demotes the previous one", async () => {
        const t = await makeTournament("sea-current");

        const first = await makeSeason(t.id, { ...validSeason("S1"), current: true });
        expect(first.json().current).toBe(true);

        const second = await makeSeason(t.id, { ...validSeason("S2"), current: true });
        expect(second.json().current).toBe(true);

        const rereadFirst = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons/${first.json().id}`,
            headers: auth(ownerCookie),
        });
        expect(rereadFirst.json().current).toBe(false);
    });

    it("PATCH current:true demotes the holder too", async () => {
        const t = await makeTournament("sea-current2");
        const s1 = (await makeSeason(t.id, { ...validSeason("A"), current: true })).json();
        const s2 = (await makeSeason(t.id, { ...validSeason("B") })).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/seasons/${s2.id}`,
            headers: auth(ownerCookie),
            payload: { current: true },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().current).toBe(true);

        const s1After = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons/${s1.id}`,
            headers: auth(ownerCookie),
        });
        expect(s1After.json().current).toBe(false);
    });
});


describe("GET …/seasons — list & read", () => {
    it("list excludes soft-deleted seasons", async () => {
        const t = await makeTournament("sea-list");
        const s1 = (await makeSeason(t.id, validSeason("Keep"))).json();
        await makeSeason(t.id, validSeason("Drop"));

        const before = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons`,
            headers: auth(ownerCookie),
        });
        expect(before.json().items).toHaveLength(2);

        await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/seasons/${s1.id}`,
            headers: auth(adminCookie),
        });

        const after = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons`,
            headers: auth(ownerCookie),
        });
        expect(after.json().items).toHaveLength(1);
        expect(after.json().items[0].name).toBe("Drop");
    });

    it("404 listing seasons of an unknown tournament", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments/00000000-0000-4000-8000-000000000000/seasons",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("404 when the season belongs to a different tournament", async () => {
        const tA = await makeTournament("sea-parentA");
        const tB = await makeTournament("sea-parentB");
        const season = (await makeSeason(tA.id)).json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${tB.id}/seasons/${season.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("PRIVATE parent: operator reads → 404, admin → 200", async () => {
        const t = await makeTournament("sea-privread", { visibility: "PRIVATE" }, adminCookie);
        const season = (await makeSeason(t.id, validSeason(), adminCookie)).json();

        const denied = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(ownerCookie),
        });
        expect(denied.statusCode).toBe(404);

        const allowed = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(adminCookie),
        });
        expect(allowed.statusCode).toBe(200);
    });
});


describe("PATCH …/seasons/:seasonId", () => {
    it("200 for the parent owner", async () => {
        const t = await makeTournament("sea-patch");
        const season = (await makeSeason(t.id)).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(ownerCookie),
            payload: { name: "Renamed Season" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().name).toBe("Renamed Season");
    });

    it("403 for a non-owner operator", async () => {
        const t = await makeTournament("sea-patch403");
        const season = (await makeSeason(t.id)).json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(otherCookie),
            payload: { name: "Hijack" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("404 for an unknown season id", async () => {
        const t = await makeTournament("sea-patch404");
        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/seasons/00000000-0000-4000-8000-000000000000`,
            headers: auth(ownerCookie),
            payload: { name: "Ghost" },
        });
        expect(res.statusCode).toBe(404);
    });
});


describe("DELETE …/seasons/:seasonId (soft delete)", () => {
    it("403 for an operator — ADMIN only", async () => {
        const t = await makeTournament("sea-del403");
        const season = (await makeSeason(t.id)).json();

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(403);
    });

    it("204 for an admin, then hidden everywhere; second delete → 404", async () => {
        const t = await makeTournament("sea-del204");
        const season = (await makeSeason(t.id)).json();

        const del = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(adminCookie),
        });
        expect(del.statusCode).toBe(204);
        expect(del.body).toBe("");

        const get = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(ownerCookie),
        });
        expect(get.statusCode).toBe(404);

        const again = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/seasons/${season.id}`,
            headers: auth(adminCookie),
        });
        expect(again.statusCode).toBe(404);
    });

    it("deleting a current season lets another become current", async () => {
        const t = await makeTournament("sea-delcurrent");
        const s1 = (await makeSeason(t.id, { ...validSeason("Cur"), current: true })).json();
        const s2 = (await makeSeason(t.id, validSeason("Next"))).json();

        const del = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${t.id}/seasons/${s1.id}`,
            headers: auth(adminCookie),
        });
        expect(del.statusCode).toBe(204);

        const promote = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${t.id}/seasons/${s2.id}`,
            headers: auth(ownerCookie),
            payload: { current: true },
        });
        expect(promote.statusCode).toBe(200);
        expect(promote.json().current).toBe(true);
    });
});
