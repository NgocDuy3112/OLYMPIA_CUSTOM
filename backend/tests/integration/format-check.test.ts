import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { questionBank, tournamentPlayers, tournaments, users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";


let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;
let playerIds: string[];      

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });
const tournamentUrl = (suffix: string) =>
    `/portal/tournaments/${tournamentId}${suffix}`;

const seat = (index: number) => ({
    kind: "user" as const,
    userId: playerIds[index],
    seed: index + 1
});

const createMatch = (payload: Record<string, unknown>) =>
    app.inject({
        method: "POST",
        url: tournamentUrl("/matches"),
        headers: auth(ownerCookie),
        payload: {
            stageId: "splitting-1",
            label: "Match",
            scheduledAt: "2026-03-01T10:00:00Z",
            roundConfigs: {
                "ve-dich": {
                    allowedKinds: ["CHOICE"],
                    scoring: { template: "constant", points: 10 },
                    turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 2 }]
                }
            },
            ...payload
        }
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "fc-owner", displayName: "FC Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 16 }, (_, i) => ({
            role: "PLAYER" as const, username: `fc${i}`,
            email: `fc${i}@example.com`,
            displayName: `FC${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);

    const tournamentTags = ["THTH"];
    const tournamentOwner = owner.id;
    const tournamentSlug = "fc-tournament-tournament";

    const [tournament] = await db.insert(tournaments).values({
        ownerId: tournamentOwner, visibility: "PUBLIC", slug: tournamentSlug,
        name: "FC Tournament",
        rounds: [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }],
        format: { competitorsPerMatch: 4 },
        stages: [{ id: "splitting-1", title: "Splitting 1", role: "splitting" }],
        roundRules: {
            "ve-dich": {
                allowedKinds: ["CHOICE"],
                scoring: { template: "constant", points: 10 },
                turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 2 }]
            }
        }
    }).returning();
    tournamentId = tournament.id;

    await db.insert(tournamentPlayers).values(
        playerIds.map((userId, index) => ({
            tournamentId,
            userId,
            enrolledAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index))
        }))
    );

    await db.insert(questionBank).values(
        Array.from({ length: 8 }, (_, i) => ({
            kind: "CHOICE" as const,
            questionText: `Q${i}`,
            
            payload: { type: "CHOICE" as const, options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctSet: ["a"] },
            timeLimit: 30,
            status: "PUBLISHED" as const,
            tournamentId: null,
            createdBy: owner.id
        }))
    );
});

afterAll(async () => {
    await app.close();
});


describe("the tier draw", () => {
    it("accepts a match with one player from each tier", async () => {
        const res = await createMatch({ players: [seat(0), seat(4), seat(8), seat(12)] });
        expect(res.statusCode).toBe(201);
    });

    it("refuses a match with two players from the same tier", async () => {
        const res = await createMatch({ players: [seat(0), seat(1), seat(8), seat(12)] });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
        expect(JSON.stringify(res.json().details)).toContain("tier 0");
    });

    it("refuses a match that misses a tier", async () => {
        const res = await createMatch({ players: [seat(0), seat(4), seat(8), seat(9)] });
        expect(res.statusCode).toBe(400);
        expect(JSON.stringify(res.json().details)).toContain("tier 2");
    });

    it("leaves a stage without a role alone", async () => {
        const res = await createMatch({
            stageId: "somewhere-else",
            players: [seat(0), seat(1), seat(2), seat(3)]
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().message).toContain("not one of this tournament's stages");
    });
});
