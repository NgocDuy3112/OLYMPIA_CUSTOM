import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { db } from "../../src/db/pool.js";
import {
    matchDraws, matches, matchResults, questionBank, seasonPhaseResults, seasons, tournaments, users
} from "../../src/db/schema/index.js";
import { signToken } from "../../src/lib/jwt.js";
import type { PlacementTier, Progression, RoundConfig, SeasonRound, TournamentFormat } from "../../src/game/contracts/index.js";


const PROGRESSION: Progression = { advance: 16, questionCount: 16, groupSize: 4, splittingRounds: 2, finaleSize: 4 };
const ROUNDS: SeasonRound[] = [{ id: "ve-dich", name: "Ve Dich", order: 0, chart: "grid" }];
const FORMAT: TournamentFormat = {
    competitorsPerMatch: 4,
    allowedSeatKinds: ["user"],
    teamSize: null,
    teamAggregation: null,
    teamCountAggregation: null
};
const TIERS: PlacementTier[] = [{ min: 1, max: 4, points: 10 }];

async function scoreStage(season: string, stageId: string, points: Record<string, number>) {
    const rows = await db.select().from(matches).where(
        and(eq(matches.seasonId, season), eq(matches.stageId, stageId))
    );

    for (const row of rows) {
        const seated = row.players.flatMap((seat) =>
            "userId" in seat && seat.userId ? [seat.userId] : []);

        await db.insert(matchResults).values({
            matchId: row.id,
            seasonId: season,
            results: seated.map((userId, index) => ({
                kind: "user" as const,
                userId,
                totalScore: points[userId] ?? 0,
                rank: index + 1,
                roundScores: {}
            }))
        });
    }
}


const rulesWith = (questionCount: number): Record<string, RoundConfig> => ({
    "ve-dich": {
        allowedKinds: ["MC"],
        scoring: { template: "constant", points: 10 },
        turns: [{ id: "phase1", mode: "text", delivery: "batch", questionCount }]
    }
});

let app: FastifyInstance;
let ownerCookie: string;
let tournamentId: string;
let seasonId: string;
let playerIds: string[];

const auth = (cookie: string) => ({ cookie: `portal_session=${cookie}` });

async function newSeason(
    name: string,
    roundRules: Record<string, RoundConfig> | null
): Promise<string> {
    const [row] = await db.insert(seasons).values({
        tournamentId,
        name,
        rounds: ROUNDS,
        format: FORMAT,
        placementTiers: TIERS,
        stages: [],
        progression: PROGRESSION,
        roundRules
    }).returning();
    return row.id;
}

async function closeQualification(season: string): Promise<void> {
    await db.insert(seasonPhaseResults).values(
        playerIds.map((userId, index) => ({
            seasonId: season,
            phaseId: "qualification",
            round: 1,
            userId,
            score: 100 - index,
            rank: index + 1
        }))
    );
}

const drawUrl = (season: string) =>
    `/portal/tournaments/${tournamentId}/seasons/${season}/splitting/draw`;

const draw = (season: string, payload: Record<string, unknown> = {}) =>
    app.inject({
        method: "POST",
        url: drawUrl(season),
        headers: auth(ownerCookie),
        payload: { round: 1, scheduledAt: "2026-11-01T19:00:00.000Z", ...payload }
    });

beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    const [owner] = await db.insert(users).values({
        role: "OPERATOR", username: "s-owner", displayName: "S Owner", tokenVersion: 0
    }).returning();
    ownerCookie = signToken(app, "PORTAL", { sub: owner.id, role: "OPERATOR", tokenVersion: 0 });

    const players = await db.insert(users).values(
        Array.from({ length: 16 }, (_, i) => ({
            role: "PLAYER" as const,
            email: `s${i}@example.com`,
            displayName: `S${i}`,
            tokenVersion: 0
        }))
    ).returning();
    playerIds = players.map((row) => row.id);

    const [tournament] = await db.insert(tournaments).values({
        name: "S Tournament",
        slug: "s-tournament",
        visibility: "PUBLIC",
        ownerId: owner.id,
        defaultTags: ["THTH"],
        defaultRounds: ROUNDS,
        defaultFormat: FORMAT,
        defaultPlacementTiers: TIERS,
        defaultProgression: PROGRESSION
    }).returning();
    tournamentId = tournament.id;

    await db.insert(questionBank).values(
        Array.from({ length: 16 }, (_, i) => ({
            kind: "MC" as const,
            questionText: `Q${i}`,
            tag: "THTH",
            payload: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctSet: ["a"] },
            timeLimit: 30,
            status: "PUBLISHED" as const,
            tournamentId: null,
            createdBy: owner.id
        }))
    );

    seasonId = await newSeason("S Season", rulesWith(12));
});

afterAll(async () => {
    await app.close();
});

describe("splitting — guards", () => {
    it("refuses to draw before qualification is closed", async () => {
        const res = await draw(seasonId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_SETUP");
    });

    it("refuses a season whose rounds have no rules", async () => {
        const bare = await newSeason("S Bare", null);
        await closeQualification(bare);

        const res = await draw(bare);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_SETUP");
    });

    it("refuses when the bank cannot fill the round", async () => {
        const hungry = await newSeason("S Hungry", rulesWith(99));
        await closeQualification(hungry);

        const res = await draw(hungry);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_ENOUGH_QUESTIONS");
    });

    it("refuses an out-of-range round", async () => {
        const res = await draw(seasonId, { round: 3 });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
    });
});

describe("splitting — the draw", () => {
    let groups: string[][];
    let seed: string;

    it("draws four groups of four, one player from each rank tier", async () => {
        await closeQualification(seasonId);

        const res = await draw(seasonId);
        expect(res.statusCode).toBe(201);

        const body = res.json();
        groups = body.groups;
        seed = body.seed;

        expect(body.stageId).toBe("splitting-1");
        expect(body.matchIds).toHaveLength(4);
        expect(groups).toHaveLength(4);
        expect(groups.flat()).toHaveLength(16);
        expect(new Set(groups.flat()).size).toBe(16);

        for (const group of groups) {
            const ranks = group.map((userId) => playerIds.indexOf(userId));
            const tiers = new Set(ranks.map((rank) => Math.floor(rank / 4)));
            expect(tiers.size).toBe(4);
        }
    });

    it("creates four matches, slotted 1..4, each with four seated players", async () => {
        const rows = await db.select().from(matches).where(eq(matches.seasonId, seasonId));
        expect(rows).toHaveLength(4);
        expect(rows.map((row) => row.slot).sort()).toEqual([1, 2, 3, 4]);
        expect(new Set(rows.map((row) => row.stageId))).toEqual(new Set(["splitting-1"]));

        for (const row of rows) {
            expect(row.players).toHaveLength(4);
            expect(new Set(row.players.map((seat) => seat.seed)).size).toBe(4);
        }
    });

    it("gives all four matches the same questions — the point of the pass", async () => {
        const rows = await db.select().from(matches).where(eq(matches.seasonId, seasonId));

        const selection = (questions: (typeof rows)[number]["questions"]) =>
            questions.map((q) => `${q.roundId}/${q.turnId}/${q.position}/${q.sourceId}`).join("|");

        const selections = new Set(rows.map((row) => selection(row.questions)));
        expect(selections.size).toBe(1);
        expect(rows[0].questions).toHaveLength(12);
    });

    it("records a receipt with the same seed and questions", async () => {
        const [receipt] = await db.select().from(matchDraws).where(eq(matchDraws.seasonId, seasonId));
        expect(receipt.stageId).toBe("splitting-1");
        expect(receipt.seed).toBe(seed);
        expect(receipt.groups).toEqual(groups);
        expect(receipt.questions).toHaveLength(12);
    });

    it("refuses a second draw of the same round", async () => {
        const res = await draw(seasonId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("ALREADY_SETUP");

        const rows = await db.select().from(matchDraws).where(eq(matchDraws.seasonId, seasonId));
        expect(rows).toHaveLength(1);
    });

    it("refuses round 2 before round 1 has results", async () => {
        const res = await draw(seasonId, { round: 2 });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_SETUP");
    });
});


describe("splitting — closing", () => {
    const closeUrl = (season: string) =>
        `/portal/tournaments/${tournamentId}/seasons/${season}/splitting/close`;

    const close = (season: string, payload: Record<string, unknown> = {}) =>
        app.inject({
            method: "POST", url: closeUrl(season), headers: auth(ownerCookie), payload
        });

    const descending = () => Object.fromEntries(playerIds.map((id, i) => [id, 100 - i]));
    const ascending = () => Object.fromEntries(playerIds.map((id, i) => [id, i]));

    it("refuses to close before round 2 has been played", async () => {
        await scoreStage(seasonId, "splitting-1", descending());

        const res = await close(seasonId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_SETUP");
    });

    it("ranks by round 2, not by round 1", async () => {
        await draw(seasonId, { round: 2 });
        // Round 2 reverses the round-1 order, so the two rounds disagree on purpose.
        await scoreStage(seasonId, "splitting-2", ascending());

        const res = await close(seasonId);
        expect(res.statusCode).toBe(200);

        const rows = res.json().rows as Array<{ userId: string; rank: number; score: number }>;
        expect(rows).toHaveLength(16);
        expect(rows[0].userId).toBe(playerIds[15]);
        expect(rows.map((row) => row.rank)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1));
        expect(rows[0].score).toBe(15);

        const persisted = await db.select().from(seasonPhaseResults).where(and(
            eq(seasonPhaseResults.seasonId, seasonId),
            eq(seasonPhaseResults.phaseId, "splitting"),
            eq(seasonPhaseResults.round, 2)
        ));
        expect(persisted).toHaveLength(16);
    });

    it("refuses to close twice", async () => {
        const res = await close(seasonId);
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("CLOSED");
    });

    it("refuses a tie that spans a seeding block, and accepts it with a tie-break", async () => {
        const tieSeason = await newSeason("S Tie", rulesWith(12));
        await closeQualification(tieSeason);

        await draw(tieSeason, { round: 1 });
        await scoreStage(tieSeason, "splitting-1", {});
        await draw(tieSeason, { round: 2 });
        await scoreStage(tieSeason, "splitting-2", {});

        const blocked = await close(tieSeason);
        expect(blocked.statusCode).toBe(409);
        expect(blocked.json().error).toBe("TIES_UNRESOLVED");
        expect(blocked.json().details).toHaveLength(1);

        const order = [...playerIds].reverse();
        const resolved = await close(tieSeason, {
            tieBreaks: [{ players: playerIds, order }]
        });
        expect(resolved.statusCode).toBe(200);

        const rows = resolved.json().rows as Array<{ userId: string; rank: number }>;
        expect(rows[0].userId).toBe(order[0]);
        expect(rows[15].userId).toBe(order[15]);
    });
});


describe("splitting — partial stages", () => {
    const closeUrl = (season: string) =>
        `/portal/tournaments/${tournamentId}/seasons/${season}/splitting/close`;

    it("refuses to draw round 2 when round 1 is only partly scored", async () => {
        const s = await newSeason("S Partial Draw", rulesWith(12));
        await closeQualification(s);
        await draw(s, { round: 1 });

        // Score only ONE of the four matches of stage 1.
        const [firstMatch] = await db.select().from(matches)
            .where(and(eq(matches.seasonId, s), eq(matches.stageId, "splitting-1")))
            .limit(1);
        const seated = firstMatch.players.flatMap((seat) =>
            "userId" in seat && seat.userId ? [seat.userId] : []);

        await db.insert(matchResults).values({
            matchId: firstMatch.id,
            seasonId: s,
            results: seated.map((userId, index) => ({
                kind: "user" as const, userId, totalScore: 10, rank: index + 1, roundScores: {}
            }))
        });

        const res = await draw(s, { round: 2 });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_SETUP");
    });

    it("refuses to close when a player who played round 2 has no round-1 score", async () => {
        const s = await newSeason("S Partial Close", rulesWith(12));
        await closeQualification(s);
        await draw(s, { round: 1 });
        await scoreStage(s, "splitting-1", {});
        await draw(s, { round: 2 });
        await scoreStage(s, "splitting-2", {});

        // Drop one round-1 result: its four players still have round-2 scores.
        const [lost] = await db.select().from(matches)
            .where(and(eq(matches.seasonId, s), eq(matches.stageId, "splitting-1")))
            .limit(1);
        await db.delete(matchResults).where(eq(matchResults.matchId, lost.id));

        const res = await app.inject({
            method: "POST", url: closeUrl(s), headers: auth(ownerCookie), payload: {}
        });
        expect(res.statusCode).toBe(409);
        expect(res.json().error).toBe("NOT_SETUP");
    });
});

describe("splitting — a match placed by hand", () => {
    const matchUrl = (season: string) =>
        `/portal/tournaments/${tournamentId}/seasons/${season}/splitting/matches`;

    const place = (season: string, payload: Record<string, unknown>) =>
        app.inject({
            method: "POST", url: matchUrl(season), headers: auth(ownerCookie), payload
        });

    async function seasonWithPlayers(name: string): Promise<string> {
        const s = await newSeason(name, rulesWith(12));
        const enrolled = await app.inject({
            method: "POST",
            url: `/portal/tournaments/${tournamentId}/seasons/${s}/players`,
            headers: auth(ownerCookie),
            payload: { userIds: playerIds }
        });
        expect(enrolled.statusCode).toBe(200);
        return s;
    }

    it("creates a match at the slot the staff picked", async () => {
        const s = await seasonWithPlayers("S Manual");

        const res = await place(s, {
            round: 1,
            slot: 2,
            playerIds: playerIds.slice(0, 4),
            scheduledAt: "2026-11-01T19:00:00.000Z"
        });
        expect(res.statusCode).toBe(201);

        const body = res.json();
        expect(body.stageId).toBe("splitting-1");
        expect(body.slot).toBe(2);
        expect(body.players).toHaveLength(4);
        expect(body.players.map((seat: { userId: string }) => seat.userId)).toEqual(playerIds.slice(0, 4));
        expect(body.questions).toHaveLength(12);

        const rows = await db.select().from(matches).where(and(
            eq(matches.seasonId, s), eq(matches.stageId, "splitting-1")
        ));
        expect(rows).toHaveLength(1);
        expect(rows[0].slot).toBe(2);
    });

    it("refuses a second match in the same slot", async () => {
        const s = await seasonWithPlayers("S Manual Twice");

        const first = await place(s, {
            round: 1, slot: 1, playerIds: playerIds.slice(0, 4), scheduledAt: "2026-11-01T19:00:00.000Z"
        });
        expect(first.statusCode).toBe(201);

        const second = await place(s, {
            round: 1, slot: 1, playerIds: playerIds.slice(4, 8), scheduledAt: "2026-11-01T19:00:00.000Z"
        });
        expect(second.statusCode).toBe(409);
        expect(second.json().error).toBe("ALREADY_SETUP");
    });

    it("refuses a group of the wrong size", async () => {
        const s = await seasonWithPlayers("S Manual Short");

        const res = await place(s, {
            round: 1, slot: 1, playerIds: playerIds.slice(0, 3), scheduledAt: "2026-11-01T19:00:00.000Z"
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
    });

    it("refuses a player who is not enrolled", async () => {
        const s = await seasonWithPlayers("S Manual Stranger");

        const [stranger] = await db.insert(users).values({
            role: "PLAYER", email: "s-stranger@example.com", displayName: "Stranger", tokenVersion: 0
        }).returning();

        const res = await place(s, {
            round: 1,
            slot: 1,
            playerIds: [...playerIds.slice(0, 3), stranger.id],
            scheduledAt: "2026-11-01T19:00:00.000Z"
        });
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe("NOT_ENROLLED");
    });

    it("refuses a round outside the season's splitting rounds", async () => {
        const s = await seasonWithPlayers("S Manual Round");

        const res = await place(s, {
            round: 3, slot: 1, playerIds: playerIds.slice(0, 4), scheduledAt: "2026-11-01T19:00:00.000Z"
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("VALIDATION");
    });
});
