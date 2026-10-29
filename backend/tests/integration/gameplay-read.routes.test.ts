import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { questionBank, tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { RoundConfig } from "../../src/game/contracts/index.js";

// The public read surface: what a spectator sees, with no session at all.
//
// The rules under test:
//   - PUBLIC serves; PRIVATE and deleted are 404 — existence never leaks, so never 403.
//   - The schedule resolves the display string ("<stage title> · <label>"), resolves
//     names, and embeds results only for FINISHED matches.
//   - The frozen questions — the bank with its answers — never reach the wire.

let app: FastifyInstance;
let ownerCookie: string;
let adminCookie: string;
let publicId: string;
let privateId: string;
let ownerId: string;
let playerIds: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

// The rulebook the tournament is played on — four MC questions in one turn.
const roundRules: Record<string, RoundConfig> = {
    "khoi-dong": {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "oral", delivery: "sequential", questionCount: 4 }]
    }
};

const STAGES = [
    { id: "qualifiers", title: "Vòng loại", start: "2026-01-01T00:00:00Z", end: "2026-01-31T00:00:00Z" },
    { id: "playoffs", title: "Vòng Playoffs", start: "2026-02-01T00:00:00Z", end: "2026-02-15T00:00:00Z" }
];

const validTournament = (name: string, visibility?: "PRIVATE") => ({
    name,
    
    rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
    format: {
        competitorsPerMatch: 4,
        allowedSeatKinds: ["user"],
        teamSize: null,
        teamAggregation: null,
        teamCountAggregation: null
    },
    placementTiers: [{ min: 1, max: 2, points: 25 }],
    stages: STAGES,
    ...(visibility ? { visibility } : {})
});

const createMatch = (tournamentId: string, payload: Record<string, unknown>) =>
    app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/matches`,
        headers: auth(ownerCookie),
        payload: {
            stageId: "playoffs",
            scheduledAt: "2026-02-01T10:00:00Z",
            ...payload
        }
    });

const setResults = (tournamentId: string, matchId: string, totals: Array<{ userId: string; score: number }>) =>
    app.inject({
        method: "POST",
        url: `/portal/tournaments/${tournamentId}/matches/${matchId}/results`,
        headers: auth(ownerCookie),
        payload: { totals }
    });

const publicGet = (suffix = "") => app.inject({ method: "GET", url: `/gameplay/tournaments${suffix}` });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const rows = await db
        .insert(users)
        .values([
            { role: "OPERATOR", username: "gr-owner", displayName: "GR Owner", tokenVersion: 0 },
            { role: "ADMIN", username: "gr-admin", displayName: "GR Admin", tokenVersion: 0 }
        ])
        .returning({ id: users.id });
    ownerCookie = signToken(app, "PORTAL", { sub: rows[0].id, role: "OPERATOR", tokenVersion: 0 });
    adminCookie = signToken(app, "PORTAL", { sub: rows[1].id, role: "ADMIN", tokenVersion: 0 });
    ownerId = rows[0].id;

    const players = await db
        .insert(users)
        .values(Array.from({ length: 4 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `gr${i}@example.test`,
            displayName: ["A. Voss", "D. Chen", "P. Okafor", "R. Lindqvist"][i],
            tokenVersion: 0
        })))
        .returning({ id: users.id });
    playerIds = players.map((row) => row.id);

    // One PUBLIC and one PRIVATE tournament — the pair every visibility rule is read against.
    const created = await db
        .insert(tournaments)
        .values([
            { ownerId: ownerId, slug: "gr-public", name: "GR Public", visibility: "PUBLIC", ...baseTournament() },
            { ownerId: ownerId, slug: "gr-private", name: "GR Private", visibility: "PRIVATE", ...baseTournament() }
        ])
        .returning({ id: tournaments.id, visibility: tournaments.visibility });
    publicId = created.find((row) => row.visibility === "PUBLIC")!.id;
    privateId = created.find((row) => row.visibility === "PRIVATE")!.id;

    // The roster is the tournament's field: places count it, and the standings read
    // display names out of it. A player seated but never enrolled still gets a place —
    // with the raw id for a name.
    await db.insert(tournamentPlayers).values(
        playerIds.map((userId) => ({ tournamentId: publicId, userId }))
    );

    // The bank the matches assemble from. The question text is a canary: if it ever
    // appears in a public response, the frozen copies have leaked.
    await db.insert(questionBank).values(
        Array.from({ length: 8 }, (_, i) => ({
            kind: "MC" as const,
            questionText: `CANARY-QUESTION-${i}`,
            
            payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctSet: ["a"] },
            timeLimit: 30,
            status: "PUBLISHED" as const,
            createdBy: rows[0].id
        }))
    );
});

// The shared tournament body, minus the identity the insert adds per row.
function baseTournament() {
    return {
        
        rounds: [{ id: "khoi-dong", name: "Khởi động", order: 0, chart: "bars" }],
        format: {
            competitorsPerMatch: 4,
            allowedSeatKinds: ["user"] as Array<"user" | "team">,
            teamSize: null,
            teamAggregation: null,
            teamCountAggregation: null
        },
        placementTiers: [{ min: 1, max: 2, points: 25 }],
        stages: STAGES,
        roundRules
    };
}

afterAll(async () => {
    await app.close();
    await db.$client.end();
});


describe("GET /gameplay/tournaments — the list", () => {
    it("serves without a session and lists only the public tournaments", async () => {
        const res = await publicGet();
        expect(res.statusCode).toBe(200);

        const slugs = res.json().tournaments.map((row: { slug: string }) => row.slug);
        expect(slugs).toContain("gr-public");
        expect(slugs).not.toContain("gr-private");
    });

    it("carries identity and the derived window, and nothing else", async () => {
        const res = await publicGet();
        const row = res.json().tournaments.find((t: { slug: string }) => t.slug === "gr-public");

        expect(row).toMatchObject({
            name: "GR Public",
            current: false,
            // The window is the stage list's own strings, passed through as typed.
            start: "2026-01-01T00:00:00Z",
            end: "2026-02-15T00:00:00Z"
        });
        expect(Object.keys(row).sort()).toEqual(
            ["createdAt", "current", "end", "id", "name", "slug", "start"]
        );
    });
});


describe("GET /gameplay/tournaments/:slug — one tournament", () => {
    it("serves a public tournament with its stages, places and points scale", async () => {
        const res = await publicGet("/gr-public");
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body.name).toBe("GR Public");
        expect(body.stages.map((s: { id: string }) => s.id)).toEqual(["qualifiers", "playoffs"]);
        expect(body.placementTiers).toEqual([{ min: 1, max: 2, points: 25 }]);
        expect(body.places).toBe(4);
        expect(body.points).toMatchObject({ places: 4, covered: 2 });
    });

    it("404s a private tournament — never 403, existence never leaks", async () => {
        const res = await publicGet("/gr-private");
        expect(res.statusCode).toBe(404);
        expect(res.json().error).toBe("NOT_FOUND");
    });

    it("404s an unknown slug", async () => {
        const res = await publicGet("/no-such-tournament");
        expect(res.statusCode).toBe(404);
    });

    it("404s a slug the portal's params would reject as malformed", async () => {
        const res = await publicGet("/Not A Slug!");
        expect(res.statusCode).toBe(400);
    });

    it("never leaks the owner, the tags or the rulebook", async () => {
        const res = await publicGet("/gr-public");
        const body = res.body;

        expect(res.json()).not.toHaveProperty("ownerId");
        expect(res.json()).not.toHaveProperty("tags");
        expect(res.json()).not.toHaveProperty("roundRules");
        expect(body).not.toContain("gr-owner");
    });
});


describe("GET /gameplay/tournaments/:slug/matches — the schedule", () => {
    let finishedMatchId: string;

    beforeAll(async () => {
        // Two matches placed by hand into the playoffs stage: one is played to a
        // result, one is left upcoming.
        const finished = await createMatch(publicId, {
            slot: 1,
            label: "Quarterfinal 1",
            players: playerIds.map((userId, seat) => ({ kind: "user", userId, seed: seat + 1 }))
        });
        if (finished.statusCode !== 201) throw new Error(`match: ${finished.statusCode} ${finished.body}`);
        finishedMatchId = finished.json().id;

        await setResults(publicId, finishedMatchId, [
            { userId: playerIds[0], score: 40 },
            { userId: playerIds[1], score: 30 },
            { userId: playerIds[2], score: 20 },
            { userId: playerIds[3], score: 10 }
        ]);

        const upcoming = await createMatch(publicId, {
            slot: 2,
            label: "Quarterfinal 2",
            players: playerIds.map((userId, seat) => ({ kind: "user", userId, seed: 4 - seat }))
        });
        if (upcoming.statusCode !== 201) throw new Error(`match: ${upcoming.statusCode} ${upcoming.body}`);
    });

    it("serves without a session, paged", async () => {
        const res = await publicGet("/gr-public/matches");
        expect(res.statusCode).toBe(200);

        const body = res.json();
        expect(body).toMatchObject({ total: 2, limit: 20, offset: 0 });
        expect(body.items).toHaveLength(2);
    });

    it("composes round as the stage title behind the label", async () => {
        const res = await publicGet("/gr-public/matches");
        const rounds = res.json().items.map((m: { round: string }) => m.round);
        expect(rounds).toContain("Vòng Playoffs · Quarterfinal 1");
        expect(rounds).toContain("Vòng Playoffs · Quarterfinal 2");
    });

    it("resolves the seated players to names", async () => {
        const res = await publicGet("/gr-public/matches");
        const finished = res.json().items.find((m: { id: string }) => m.id === finishedMatchId);

        expect(finished.players).toEqual([
            { id: playerIds[0], name: "A. Voss", seed: 1 },
            { id: playerIds[1], name: "D. Chen", seed: 2 },
            { id: playerIds[2], name: "P. Okafor", seed: 3 },
            { id: playerIds[3], name: "R. Lindqvist", seed: 4 }
        ]);
    });

    it("embeds the stored results for a FINISHED match, ranked by score", async () => {
        const res = await publicGet("/gr-public/matches");
        const finished = res.json().items.find((m: { id: string }) => m.id === finishedMatchId);

        expect(finished.status).toBe("FINISHED");
        expect(finished.results).toHaveLength(4);
        expect(finished.results[0]).toMatchObject({ id: playerIds[0], name: "A. Voss", totalScore: 40, rank: 1 });
        expect(finished.results[3]).toMatchObject({ id: playerIds[3], totalScore: 10, rank: 4 });
    });

    it("carries no results for an UPCOMING match", async () => {
        const res = await publicGet("/gr-public/matches");
        const upcoming = res.json().items.find((m: { status: string }) => m.status === "UPCOMING");

        expect(upcoming).toBeDefined();
        expect(upcoming).not.toHaveProperty("results");
    });

    it("never lets the frozen questions onto the wire", async () => {
        const res = await publicGet("/gr-public/matches?limit=100");

        expect(res.body).not.toContain("CANARY-QUESTION");
        expect(res.body).not.toContain("questions");
        expect(res.body).not.toContain("roundConfigs");
        expect(res.body).not.toContain("acceptedAnswers");
    });

    it("404s the schedule of a private tournament", async () => {
        const res = await publicGet("/gr-private/matches");
        expect(res.statusCode).toBe(404);
    });

    it("400s a limit that is not a number", async () => {
        const res = await publicGet("/gr-public/matches?limit=abc");
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
    });
});


describe("GET /gameplay/tournaments/:slug/standings — the places", () => {
    it("serves without a session, ranked by how far each player got", async () => {
        const res = await publicGet("/gr-public/standings");
        expect(res.statusCode).toBe(200);

        const rows = res.json().rows;
        expect(rows).toHaveLength(4);
        expect(rows[0]).toMatchObject({
            userId: playerIds[0],
            displayName: "A. Voss",
            place: 1,
            matchesPlayed: 1,
            placementPoints: 25,
            stageTitle: "Vòng Playoffs"
        });
    });

    it("404s the standings of a private tournament", async () => {
        const res = await publicGet("/gr-private/standings");
        expect(res.statusCode).toBe(404);
    });
});


describe("a tournament that stops being public", () => {
    it("disappears from the public surface the moment it is soft-deleted", async () => {
        // Create a third public tournament, read it once, then delete it as ADMIN.
        const created = await db
            .insert(tournaments)
            .values({ ownerId, slug: "gr-doomed", name: "GR Doomed", visibility: "PUBLIC", ...baseTournament() })
            .returning({ id: tournaments.id });

        expect((await publicGet("/gr-doomed")).statusCode).toBe(200);

        const deleted = await app.inject({
            method: "DELETE",
            url: `/portal/tournaments/${created[0].id}`,
            headers: auth(adminCookie)
        });
        expect(deleted.statusCode).toBe(204);

        expect((await publicGet("/gr-doomed")).statusCode).toBe(404);
        const list = await publicGet();
        expect(list.json().tournaments.map((t: { slug: string }) => t.slug)).not.toContain("gr-doomed");
    });
});
