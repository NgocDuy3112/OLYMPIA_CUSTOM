import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import { users } from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";


let app: FastifyInstance;
let cookie: string;

const auth = () => ({ cookie: `portal_session=${cookie}` });

async function newTournament(name: string, format?: unknown) {
    const res = await app.inject({
        method: "POST",
        url: "/portal/tournaments",
        headers: auth(),
        payload: {
            name,
            rounds: [{ id: "khoidong", name: "Khởi động", order: 0, chart: "bars" }],
            roundRules: {
                khoidong: {
                    allowedKinds: ["TEXT"],
                    scoring: { template: "constant", points: 10 },
                    turns: [{ id: "phase1", mode: "oral", delivery: "sequential" }],
                },
            },
            stages: [{ id: "stage-1", title: "Stage 1" }],
            ...(format ? { format } : {}),
        },
    });
    if (res.statusCode !== 201) throw new Error(`tournament: ${res.statusCode} ${res.body}`);
    return res.json() as { id: string; format: { competitorsPerMatch: number; allowedCompetitorCounts?: number[] } };
}

const seats = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ kind: "user" as const, userId: crypto.randomUUID(), seed: index + 1 }));

describe("how many players a match holds", () => {
    beforeAll(async () => {
        app = await buildApp();
        const [owner] = await db
            .insert(users)
            .values({ role: "OPERATOR", username: "seat-owner", displayName: "Seat Owner", tokenVersion: 0 })
            .returning();
        cookie = signToken(app, "PORTAL", { sub: owner!.id, role: "OPERATOR", tokenVersion: 0 });
    });

    afterAll(async () => {
        await app.close();
    });

    it("a tournament created without a format allows 3 AND 4", async () => {
        const tournament = await newTournament("Seats default");
        expect(tournament.format.competitorsPerMatch).toBe(4);
        expect(tournament.format.allowedCompetitorCounts).toEqual([3, 4]);
    });

    it("accepts a three-seat match", async () => {
        const tournament = await newTournament("Seats three");
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournament.id}/matches`,
            headers: auth(),
            payload: {
                stageId: "stage-1",
                label: "Three",
                scheduledAt: "2026-03-01T10:00:00Z",
                roundConfigs: {},
                players: seats(3),
            },
        });
        expect(res.statusCode).toBe(201);
        expect((res.json() as { players: unknown[] }).players).toHaveLength(3);
    });

    it("accepts a four-seat match too", async () => {
        const tournament = await newTournament("Seats four");
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournament.id}/matches`,
            headers: auth(),
            payload: {
                stageId: "stage-1",
                label: "Four",
                scheduledAt: "2026-03-01T10:00:00Z",
                roundConfigs: {},
                players: seats(4),
            },
        });
        expect(res.statusCode).toBe(201);
    });

    it("refuses two, and says which counts are allowed", async () => {
        const tournament = await newTournament("Seats two");
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournament.id}/matches`,
            headers: auth(),
            payload: {
                stageId: "stage-1",
                label: "Two",
                scheduledAt: "2026-03-01T10:00:00Z",
                roundConfigs: {},
                players: seats(2),
            },
        });
        expect(res.statusCode).toBe(400);
        expect((res.json() as { message: string }).message).toContain("3 or 4");
    });

    it("a tournament that names ONE count stays fixed to it", async () => {
        const tournament = await newTournament("Seats fixed", { competitorsPerMatch: 3 });
        const res = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournament.id}/matches`,
            headers: auth(),
            payload: {
                stageId: "stage-1",
                label: "Four on a three-seat format",
                scheduledAt: "2026-03-01T10:00:00Z",
                roundConfigs: {},
                players: seats(4),
            },
        });
        expect(res.statusCode).toBe(400);
    });
});
