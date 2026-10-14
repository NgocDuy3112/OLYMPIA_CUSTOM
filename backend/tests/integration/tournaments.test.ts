import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/pool.js";
import { tournaments, users } from "../../src/db/schema/index.js";
import {
    createTournament,
    getBySlug,
    TournamentError,
    type CreateTournamentInput
} from "../../src/modules/tournaments/index.js";


afterAll(async () => {
    await db.$client.end();        // the singleton's underlying pg Pool
});

let ownerId: string;

beforeAll(async () => {
    const [owner] = await db
        .insert(users)
        .values({ role: "ADMIN", username: "t-owner", displayName: "Owner" })
        .returning({ id: users.id });
    ownerId = owner.id;
});

const validTournament = (slug: string): CreateTournamentInput => ({
    name: "Test Cup",
    slug,
    defaultTags: ["THTH", "TNSS"],
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

describe("tournaments service", () => {
    it("creates a tournament and defaults visibility to PUBLIC", async () => {
        const row = await createTournament(validTournament("cup-a"), ownerId);

        expect(row.id).toBeDefined();
        expect(row.visibility).toBe("PUBLIC");
        expect(row.defaultRounds).toHaveLength(1);
    });

    it("rejects a round missing chart (Value.Check) without inserting", async () => {
        const bad = {
            ...validTournament("cup-b"),
            defaultRounds: [{ id: "r1", name: "Round One", order: 0 }]   // no chart
        };

        await expect(createTournament(bad as never, ownerId)).rejects.toMatchObject({
            code: "VALIDATION"
        });

        const rows = await db.select().from(tournaments).where(eq(tournaments.slug, "cup-b"));
        expect(rows).toHaveLength(0);        // validation must precede any SQL
    });

    it("rejects a wrong-typed format field at runtime", async () => {
        const bad = {
            ...validTournament("cup-c"),
            defaultFormat: { ...validTournament("cup-x").defaultFormat, competitorsPerMatch: "4" }
        };

        await expect(createTournament(bad as never, ownerId)).rejects.toMatchObject({
            code: "VALIDATION"
        });
    });

    it("rejects a duplicate slug with SLUG_TAKEN", async () => {
        await createTournament(validTournament("cup-d"), ownerId);

        await expect(createTournament(validTournament("cup-d"), ownerId)).rejects.toMatchObject({
            code: "SLUG_TAKEN"
        });
    });

    it("throws NOT_FOUND from getBySlug", async () => {
        await expect(getBySlug("no-such-cup")).rejects.toMatchObject({
            code: "NOT_FOUND"
        });
    });
});