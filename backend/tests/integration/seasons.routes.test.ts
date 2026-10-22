import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { matches, seasons, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { CreateSeasonInput } from "../../src/modules/seasons/index.js";
import { eq } from "drizzle-orm";


let app: FastifyInstance;
let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;
let ownerId: string;

const portalCookie = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") =>
    signToken(app, "PORTAL", { sub: userId, role, tokenVersion: 0 });

const validSeason = (name = "Season 1"): CreateSeasonInput => ({
    name,
    tags: ["THTH"],
    rounds: [{ id: "r1", name: "Round One", order: 0, chart: "bars" }],
    format: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    placementTiers: [{ min: 1, max: 4, points: 10 }],
    stages: [
        { id: "s1", title: "Qualifiers", start: "2026-01-01T00:00:00Z", end: "2026-06-01T00:00:00Z" }
    ]
});

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

async function makeSeason(
    payload: Partial<CreateSeasonInput> = {},
    cookie = ownerCookie
) {
    return app.inject({
        method: "POST",
        url: "/portal/seasons",
        headers: auth(cookie),
        payload: { ...validSeason(), ...payload },
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
    ownerId = rows[1].id;
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("POST /portal/seasons — create", () => {
    it("401 without a session", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/seasons",
            payload: validSeason(),
        });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER", async () => {
        const res = await makeSeason({}, playerCookie);
        expect(res.statusCode).toBe(403);
    });

    it("201 — the creator owns it, and the slug comes from the name", async () => {
        const res = await makeSeason({ name: "Season One" });
        expect(res.statusCode).toBe(201);

        const body = res.json();
        expect(body.name).toBe("Season One");
        expect(body.slug).toBe("season-one");
        expect(body.ownerId).toBe(ownerId);
        expect(body.visibility).toBe("PUBLIC");
        expect(body.tags).toEqual(["THTH"]);
        expect(body.current).toBe(false);
        expect(body.deletedAt).toBeNull();
    });

    it("201 — the slug is unique", async () => {
        await makeSeason({ name: "Same Name" });
        const second = await makeSeason({ name: "Same Name" });
        expect(second.statusCode).toBe(201);
        expect(second.json().slug).not.toBe("same-name");
    });

    it("400 when the name is missing", async () => {
        const res = await makeSeason({ name: "" });
        expect(res.statusCode).toBe(400);
    });

    it("201 for an ADMIN", async () => {
        const res = await makeSeason({ name: "Admin Season" }, adminCookie);
        expect(res.statusCode).toBe(201);
    });
});


describe("the current flag — one per owner", () => {
    it("creating a new current season demotes the previous one", async () => {
        const first = await makeSeason({ name: "Current 1", current: true });
        expect(first.json().current).toBe(true);

        const second = await makeSeason({ name: "Current 2", current: true });
        expect(second.json().current).toBe(true);

        const [reread] = await db.select().from(seasons)
            .where(eq(seasons.id, first.json().id));
        expect(reread.current).toBe(false);
    });
});


describe("GET /portal/seasons — list", () => {
    it("lists the seasons of the portal", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/seasons?limit=100",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().items.length).toBeGreaterThan(0);
    });
});


describe("GET /portal/seasons/:id — read", () => {
    it("404 for an unknown id", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/seasons/00000000-0000-4000-8000-000000000000",
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(404);
    });

    it("carries the places and the coverage of the points scale", async () => {
        const created = await makeSeason({ name: "Covered" });
        const res = await app.inject({
            method: "GET",
            url: `/portal/seasons/${created.json().id}`,
            headers: auth(ownerCookie),
        });
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.places).toBe(0);
        expect(body.points.places).toBe(0);
    });

    it("404 for a PRIVATE season to another operator", async () => {
        const created = await makeSeason(
            { name: "Hidden", visibility: "PRIVATE" },
            adminCookie
        );
        const id = created.json().id;

        const denied = await app.inject({
            method: "GET",
            url: `/portal/seasons/${id}`,
            headers: auth(otherCookie),
        });
        expect(denied.statusCode).toBe(404);

        const allowed = await app.inject({
            method: "GET",
            url: `/portal/seasons/${id}`,
            headers: auth(adminCookie),
        });
        expect(allowed.statusCode).toBe(200);
    });
});


describe("PATCH /portal/seasons/:id — update", () => {
    it("403 for another operator, 200 for the owner", async () => {
        const created = await makeSeason({ name: "Owned" });
        const id = created.json().id;

        const denied = await app.inject({
            method: "PATCH",
            url: `/portal/seasons/${id}`,
            headers: auth(otherCookie),
            payload: { name: "Hijacked" },
        });
        expect(denied.statusCode).toBe(403);

        const allowed = await app.inject({
            method: "PATCH",
            url: `/portal/seasons/${id}`,
            headers: auth(ownerCookie),
            payload: { name: "Renamed" },
        });
        expect(allowed.statusCode).toBe(200);
        expect(allowed.json().name).toBe("Renamed");
    });

    it("renaming the season changes its slug", async () => {
        const created = await makeSeason({ name: "Before" });
        const res = await app.inject({
            method: "PATCH",
            url: `/portal/seasons/${created.json().id}`,
            headers: auth(ownerCookie),
            payload: { name: "After" },
        });
        expect(res.json().slug).toBe("after");
    });
});


describe("the rulebook freeze", () => {
    it("refuses roundRules once a match has been assembled", async () => {
        const created = await makeSeason({ name: "Frozen" });
        const id = created.json().id;

        await db.insert(matches).values({
            seasonId: id,
            stageId: "s1",
            scheduledAt: new Date(),
            label: "Assembled",
            status: "UPCOMING",
            players: [],
            roundConfigs: {},
            questions: []
        });

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/seasons/${id}`,
            headers: auth(ownerCookie),
            payload: {
                roundRules: {
                    r1: {
                        allowedKinds: ["MC"],
                        scoring: { template: "constant", points: 10 },
                        turns: [{ id: "turn-1", mode: "oral", delivery: "sequential" }]
                    }
                }
            }
        });

        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("CONFLICT");
    });
});


describe("DELETE /portal/seasons/:id — soft delete", () => {
    it("is ADMIN-only, and the season disappears from the list", async () => {
        const created = await makeSeason({ name: "Doomed" });
        const id = created.json().id;

        const denied = await app.inject({
            method: "DELETE",
            url: `/portal/seasons/${id}`,
            headers: auth(ownerCookie),
        });
        expect(denied.statusCode).toBe(403);

        const allowed = await app.inject({
            method: "DELETE",
            url: `/portal/seasons/${id}`,
            headers: auth(adminCookie),
        });
        expect(allowed.statusCode).toBe(204);

        const gone = await app.inject({
            method: "GET",
            url: `/portal/seasons/${id}`,
            headers: auth(ownerCookie),
        });
        expect(gone.statusCode).toBe(404);
    });
});
