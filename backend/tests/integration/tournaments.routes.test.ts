import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { CreateTournamentInput } from "../../src/modules/tournaments/index.js";


let app: FastifyInstance;
let adminId: string;
let ownerId: string;
let otherId: string;
let playerId: string;

let adminCookie: string;
let ownerCookie: string;
let otherCookie: string;
let playerCookie: string;

const asPortal = (userId: string, role: "ADMIN" | "OPERATOR" | "PLAYER") => ({
    portal_session: signToken(app, "PORTAL", {
        sub: userId,
        role,
        tokenVersion: 0,
    }),
});

const validTournament = (slug: string): CreateTournamentInput => ({
    name: "Route Cup",
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

beforeAll(async () => {
    app = await buildApp();

    const rows = await db
        .insert(users)
        .values([
            { role: "ADMIN", username: "route-admin", displayName: "Admin" },
            { role: "OPERATOR", username: "route-owner", displayName: "Owner" },
            { role: "OPERATOR", username: "route-other", displayName: "Other" },
            { role: "PLAYER", email: "route-player@example.test", displayName: "Player" }
        ])
        .returning({ id: users.id, role: users.role });

    adminId = rows[0].id;
    ownerId = rows[1].id;
    otherId = rows[2].id;
    playerId = rows[3].id;

    adminCookie = asPortal(adminId, "ADMIN").portal_session;
    ownerCookie = asPortal(ownerId, "OPERATOR").portal_session;
    otherCookie = asPortal(otherId, "OPERATOR").portal_session;
    playerCookie = asPortal(playerId, "PLAYER").portal_session;
});

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("POST /portal/tournaments", () => {
    it("401 without a session cookie", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            payload: validTournament("route-a"),
        });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER session", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${playerCookie}` },
            payload: validTournament("route-b"),
        });
        expect(res.statusCode).toBe(403);
    });

    it("400 when a round misses chart (schema validation precedes the service)", async () => {
        const bad = {
            ...validTournament("route-c"),
            defaultRounds: [{ id: "r1", name: "Round One", order: 0 }],
        };

        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: bad,
        });
        expect(res.statusCode).toBe(400);
    });

    it("201 + PUBLIC default for an OPERATOR", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-owner-cup"),
        });
        expect(res.statusCode).toBe(201);

        const body = res.json();
        expect(body.visibility).toBe("PUBLIC");
        expect(body.ownerId).toBe(ownerId);
        expect(body.slug).toBe("route-owner-cup");
    });

    it("403 when an OPERATOR tries to create a PRIVATE tournament", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: { ...validTournament("route-op-private"), visibility: "PRIVATE" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("201 when an ADMIN creates a PRIVATE tournament", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { ...validTournament("route-admin-private"), visibility: "PRIVATE" },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().visibility).toBe("PRIVATE");
    });

    it("409 SLUG_TAKEN on a duplicate slug", async () => {
        await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-dupe"),
        });

        const res = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${otherCookie}` },
            payload: validTournament("route-dupe"),
        });
        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({ error: "SLUG_TAKEN" });
    });
});


describe("PATCH /portal/tournaments/:id", () => {
    it("404 for an unknown id", async () => {
        const res = await app.inject({
            method: "PATCH",
            url: "/portal/tournaments/00000000-0000-4000-8000-000000000000",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: { name: "Renamed" },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: "NOT_FOUND" });
    });

    it("403 for a staff user who is not the owner (PUBLIC)", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-guarded"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${otherCookie}` },
            payload: { name: "Hijacked" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("200 for the owner (PUBLIC)", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-editable"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: { name: "Renamed Cup" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().name).toBe("Renamed Cup");
    });

    it("200 for an ADMIN editing someone else's PUBLIC tournament", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-admin-edit"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { name: "Admin Rename" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().name).toBe("Admin Rename");
    });

    it("403 when an OPERATOR flips their own PUBLIC tournament to PRIVATE", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-flip"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: { visibility: "PRIVATE" },
        });
        expect(res.statusCode).toBe(403);
    });

    it("404 for an OPERATOR editing a PRIVATE tournament — even their own", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { ...validTournament("route-priv-edit"), visibility: "PRIVATE" },
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: { name: "Sneaky edit" },
        });
        expect(res.statusCode).toBe(404);
    });

    it("200 for an ADMIN editing a PRIVATE tournament", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { ...validTournament("route-priv-admin-edit"), visibility: "PRIVATE" },
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { name: "Admin Private Rename" },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().name).toBe("Admin Private Rename");
    });
});


describe("GET /portal/tournaments/:id", () => {
    it("200 for any portal staff session on a PUBLIC tournament", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-readable"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${otherCookie}` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().slug).toBe("route-readable");
    });

    it("403 for a PLAYER session", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-player-denied"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${playerCookie}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it("404 for an OPERATOR reading a PRIVATE tournament — even one they own", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { ...validTournament("route-priv-portal"), visibility: "PRIVATE" },
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${ownerCookie}` },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: "NOT_FOUND" });
    });

    it("200 for an ADMIN reading a PRIVATE tournament", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { ...validTournament("route-priv-admin-read"), visibility: "PRIVATE" },
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json().visibility).toBe("PRIVATE");
    });

    it("400 for a malformed id", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments/not-a-uuid",
            headers: { cookie: `portal_session=${ownerCookie}` },
        });
        expect(res.statusCode).toBe(400);
    });
});


describe("GET /tournaments/:slug (public read)", () => {
    it("200 anonymously for a PUBLIC tournament", async () => {
        await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-public"),
        });

        const res = await app.inject({ method: "GET", url: "/tournaments/route-public" });
        expect(res.statusCode).toBe(200);
        expect(res.json().slug).toBe("route-public");
    });

    it("404 anonymously for a PRIVATE tournament", async () => {
        const res = await app.inject({ method: "GET", url: "/tournaments/route-admin-private" });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: "NOT_FOUND" });
    });

    it("404 even with the creator's cookie — the public route ignores sessions", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/tournaments/route-admin-private",
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({ error: "NOT_FOUND" });
    });

    it("404 for an unknown slug", async () => {
        const res = await app.inject({ method: "GET", url: "/tournaments/no-such-slug" });
        expect(res.statusCode).toBe(404);
    });
});


describe("DELETE /portal/tournaments/:id (soft delete)", () => {
    it("403 for an OPERATOR session", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-del-op"),
        });
        const { id } = created.json();

        const res = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${ownerCookie}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it("204 for an ADMIN, then the tournament disappears everywhere", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-del-admin"),
        });
        const { id } = created.json();

        const del = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(del.statusCode).toBe(204);
        expect(del.body).toBe("");

        const byId = await app.inject({
            method: "GET",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(byId.statusCode).toBe(404);

        const patch = await app.inject({
            method: "PATCH",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { name: "Ghost edit" },
        });
        expect(patch.statusCode).toBe(404);

        const bySlug = await app.inject({
            method: "GET",
            url: "/tournaments/route-del-admin",
        });
        expect(bySlug.statusCode).toBe(404);
    });

    it("404 on a second DELETE of the same tournament", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: validTournament("route-del-twice"),
        });
        const { id } = created.json();

        const first = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(first.statusCode).toBe(204);

        const second = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(second.statusCode).toBe(404);
        expect(second.json()).toMatchObject({ error: "NOT_FOUND" });
    });

    it("404 for an unknown id", async () => {
        const res = await app.inject({
            method: "DELETE",
            url: "/portal/tournaments/00000000-0000-4000-8000-000000000000",
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(res.statusCode).toBe(404);
    });

    it("slug stays locked after delete — re-create → 409", async () => {
        const created = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-del-locked"),
        });
        const { id } = created.json();

        await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${id}`,
            headers: { cookie: `portal_session=${adminCookie}` },
        });

        const recreate = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${ownerCookie}` },
            payload: validTournament("route-del-locked"),
        });
        expect(recreate.statusCode).toBe(409);
        expect(recreate.json()).toMatchObject({ error: "SLUG_TAKEN" });
    });
});


describe("GET /portal/tournaments — list", () => {
    it("401 without a session", async () => {
        const res = await app.inject({ method: "GET", url: "/portal/tournaments" });
        expect(res.statusCode).toBe(401);
    });

    it("403 for a PLAYER", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${playerCookie}` },
        });
        expect(res.statusCode).toBe(403);
    });

    it("returns the pagination envelope and matches by search", async () => {
        for (const slug of ["pglist-a", "pglist-b"]) {
            await app.inject({
                method: "POST",
                url: "/portal/tournaments",
                headers: { cookie: `portal_session=${ownerCookie}` },
                payload: validTournament(slug),
            });
        }

        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments?search=pglist-",
            headers: { cookie: `portal_session=${ownerCookie}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(Object.keys(body).sort()).toEqual(["items", "limit", "offset", "total"]);
        expect(body.total).toBe(2);
        expect(body.items.map((t: { slug: string }) => t.slug).sort()).toEqual(["pglist-a", "pglist-b"]);
    });

    it("paginates with limit and offset", async () => {
        for (const slug of ["pgpage-a", "pgpage-b", "pgpage-c"]) {
            await app.inject({
                method: "POST",
                url: "/portal/tournaments",
                headers: { cookie: `portal_session=${ownerCookie}` },
                payload: validTournament(slug),
            });
        }

        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments?search=pgpage-&limit=2&offset=2",
            headers: { cookie: `portal_session=${ownerCookie}` },
        });

        expect(res.json().total).toBe(3);
        expect(res.json().items).toHaveLength(1);
    });

    it("400 for a non-numeric limit", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments?limit=abc",
            headers: { cookie: `portal_session=${ownerCookie}` },
        });
        expect(res.statusCode).toBe(400);
    });

    it("hides PRIVATE tournaments from operators but not from admins", async () => {
        const secret = await app.inject({
            method: "POST",
            url: "/portal/tournaments",
            headers: { cookie: `portal_session=${adminCookie}` },
            payload: { ...validTournament("pgpriv-secret"), visibility: "PRIVATE" },
        });
        const secretId = secret.json().id;

        const asOperator = await app.inject({
            method: "GET",
            url: "/portal/tournaments?search=pgpriv-",
            headers: { cookie: `portal_session=${ownerCookie}` },
        });
        expect(asOperator.json().items.map((t: { id: string }) => t.id)).not.toContain(secretId);

        const asAdmin = await app.inject({
            method: "GET",
            url: "/portal/tournaments?search=pgpriv-&visibility=PRIVATE",
            headers: { cookie: `portal_session=${adminCookie}` },
        });
        expect(asAdmin.json().items.map((t: { id: string }) => t.id)).toContain(secretId);
    });

    it("filters by visibility explicitly", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/portal/tournaments?visibility=PUBLIC&search=pglist-",
            headers: { cookie: `portal_session=${adminCookie}` },
        });

        expect(res.statusCode).toBe(200);
        expect(res.json().items.every((t: { visibility: string }) => t.visibility === "PUBLIC")).toBe(true);
    });
});
