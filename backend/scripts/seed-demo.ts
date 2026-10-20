import { eq } from "drizzle-orm";
import { db } from "../src/db/pool.js";
import {
    questionBank,
    seasonPhaseResults,
    seasonPlayers,
    seasons,
    tournaments,
    users
} from "../src/db/schema/index.js";
import type {
    Progression,
    RoundConfig,
    SeasonRound,
    TournamentFormat
} from "../src/game/contracts/index.js";

const SLUG = "demo";
const PLAYERS = 16;

const PROGRESSION: Progression = {
    advance: 16,
    questionCount: 16,
    groupSize: 4,
    splittingRounds: 2,
    finaleSize: 4
};

const ROUNDS: SeasonRound[] = [
    { id: "khoi-dong", name: "Khởi động", order: 0, chart: "grid" },
    { id: "ve-dich", name: "Về đích", order: 1, chart: "grid" }
];

const FORMAT: TournamentFormat = {
    competitorsPerMatch: 4,
    allowedSeatKinds: ["user"],
    teamSize: null,
    teamAggregation: null,
    teamCountAggregation: null
};

const TIERS = [{ min: 1, max: 4, points: 10 }];

const ROUND_RULES: Record<string, RoundConfig> = {
    "khoi-dong": {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 8 }]
    },
    "ve-dich": {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount: 8 }]
    }
};

async function main() {
    const [admin] = await db.select().from(users).where(eq(users.role, "ADMIN")).limit(1);
    if (!admin) {
        throw new Error("no ADMIN user — run `npm run seed:admin` first");
    }

    const [existing] = await db.select().from(tournaments).where(eq(tournaments.slug, SLUG)).limit(1);
    if (existing) {
        console.log(`tournament "${SLUG}" already exists (${existing.id}) — wipe it first, see the SQL below`);
        return;
    }

    const [tournament] = await db.insert(tournaments).values({
        name: "Demo Tournament",
        slug: SLUG,
        visibility: "PUBLIC",
        ownerId: admin.id,
        defaultTags: ["THTH"],
        defaultRounds: ROUNDS,
        defaultFormat: FORMAT,
        defaultPlacementTiers: TIERS,
        defaultProgression: PROGRESSION
    }).returning();

    await db.insert(questionBank).values(
        Array.from({ length: 16 }, (_, i) => ({
            kind: "MC" as const,
            questionText: `Demo question ${i + 1}`,
            tag: "DEMO",
            payload: {
                options: [{ id: "a", text: "Option A" }, { id: "b", text: "Option B" }],
                correctSet: ["a"]
            },
            timeLimit: 30,
            status: "PUBLISHED" as const,
            tournamentId: null,
            createdBy: admin.id
        }))
    ).onConflictDoNothing();

    const players = await db.insert(users).values(
        Array.from({ length: PLAYERS }, (_, i) => ({
            role: "PLAYER" as const,
            email: `demo${i + 1}@example.com`,
            displayName: `Demo Player ${String(i + 1).padStart(2, "0")}`,
            tokenVersion: 0
        }))
    ).onConflictDoNothing().returning();

    const roster = players.length > 0
        ? players
        : await db.select().from(users).where(eq(users.role, "PLAYER")).limit(PLAYERS);

    const [season] = await db.insert(seasons).values({
        tournamentId: tournament.id,
        name: "Demo Season 2026",
        current: true,
        rounds: ROUNDS,
        format: FORMAT,
        placementTiers: TIERS,
        stages: [],
        progression: PROGRESSION,
        roundRules: ROUND_RULES
    }).returning();

    await db.insert(seasonPlayers)
        .values(roster.map((player) => ({ seasonId: season.id, userId: player.id })))
        .onConflictDoNothing();

    // Qualification closed: a descending ranking the draw can be seeded from.
    await db.insert(seasonPhaseResults).values(
        roster.map((player, index) => ({
            seasonId: season.id,
            phaseId: "qualification",
            round: 1,
            userId: player.id,
            score: 100 - index,
            correctCount: PLAYERS - index,
            avgTimeMs: 2000 + index * 100,
            rank: index + 1
        }))
    ).onConflictDoNothing();

    console.log("seeded");
    console.log(`  tournament ${tournament.id}`);
    console.log(`  season     ${season.id}  (${roster.length} players, qualification closed)`);
    console.log("\nwipe with:");
    console.log(`  delete from matches where season_id in (select id from seasons where tournament_id='${tournament.id}');`);
    console.log(`  delete from seasons where tournament_id='${tournament.id}';`);
    console.log(`  delete from tournaments where id='${tournament.id}';`);
    console.log("  delete from question_bank where tag='DEMO';");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });