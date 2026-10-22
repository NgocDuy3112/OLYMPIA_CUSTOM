import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchLive, matchResults, matchStats, matches, seasons } from "../../db/schema/index.js";
import type { ResultEntry, RoundConfig, Seat } from "../../game/contracts/index.js";
import { MatchError } from "./errors.js";
import { buildQuestionCopies } from "./assembly.js";
import {
    AssembleMatchInput,
    CreateMatchInput,
    UpdateMatchInput,
    validate
} from "./schemas.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";
import { nextRoundId, orderedMatchRounds } from "./rounds.js";
import { buildMatchResults } from "./scoring.js";
import { buildStageInputs, seasonRoundConfigs } from "./stage-inputs.js";
import { recomputeStandings } from "../standings/service.js";
import { checkMatchAgainstFormat } from "../bracket/service.js";

export type MatchRow = typeof matches.$inferSelect;
type SeasonRow = typeof seasons.$inferSelect;
type MatchStatusValue = "UPCOMING" | "LIVE" | "FINISHED";
type MatchKind = "STANDARD" | "QUALIFICATION";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];


async function scoreMatch(tx: Tx, match: MatchRow): Promise<void> {
    const rows = await tx.select().from(answers).where(eq(answers.matchId, match.id));

    const unjudged = rows.filter((r) => !r.judged);
    if (unjudged.length > 0) {
        throw new MatchError(
            "NOT_READY",
            `match ${match.id} has ${unjudged.length} answer(s) without a final verdict`
        );
    }

    const questionById = new Map(match.questions.map((q) => [q._id, q]));
    const competitors = (match.players as Seat[])
        .filter((seat) => seat.kind === "user")
        .map((seat) => ({ userId: seat.userId }));

    const results = buildMatchResults({
        competitors,
        answers: rows.map((r) => ({
            userId: r.userId,
            roundId: questionById.get(r.questionId)?.roundId ?? "unknown",
            pointsAwarded: r.pointsAwarded ?? 0
        }))
    });

    // A repeated transition must not duplicate frozen rows.
    await tx.insert(matchResults)
        .values({ matchId: match.id, seasonId: match.seasonId, results })
        .onConflictDoNothing();

    if (rows.length > 0) {
        await tx.insert(matchStats).values(rows.map((r) => {
            const question = questionById.get(r.questionId);
            return {
                matchId: match.id,
                seasonId: match.seasonId,
                roundId: question?.roundId ?? "unknown",
                questionId: r.questionId,
                userId: r.userId,
                tag: question?.tag ?? null,
                basePoints: question?.points ?? null,
                answered: true,
                correct: r.verdict === "CORRECT",
                verdict: r.verdict,
                pointsAwarded: r.pointsAwarded
            };
        })).onConflictDoNothing();
    }
}

const EDGES: Record<MatchStatusValue, MatchStatusValue[]> = {
    UPCOMING: ["LIVE"],
    LIVE: ["FINISHED"],
    FINISHED: []
};


export interface MatchScope {
    season: SeasonRow;
}

async function requireSeason(seasonId: string): Promise<SeasonRow> {
    const [row] = await db
        .select()
        .from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!row) throw new MatchError("NOT_FOUND", `season ${seasonId} not found`);
    return row;
}

export async function requireMatchScope(seasonId: string): Promise<MatchScope> {
    const [season] = await db
        .select()
        .from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!season) throw new MatchError("NOT_FOUND", `season ${seasonId} not found`);

    return { season };
}

async function requireMatch(seasonId: string, matchId: string): Promise<MatchRow> {
    const [row] = await db
        .select()
        .from(matches)
        .where(and(
            eq(matches.id, matchId),
            eq(matches.seasonId, seasonId),
            isNull(matches.deletedAt)
        ))
        .limit(1);
    if (!row) throw new MatchError("NOT_FOUND", `match ${matchId} not found`);
    return row;
}

function assertRoundConfigKeys(season: SeasonRow, roundConfigs: Record<string, RoundConfig>): void {
    const roundIds = new Set(season.rounds.map((round) => round.id));
    const unknown = Object.keys(roundConfigs).filter((id) => !roundIds.has(id));

    if (unknown.length > 0) {
        throw new MatchError(
            "VALIDATION",
            "roundConfigs contains rounds that are not part of this season",
            unknown.map((id) => `unknown round id "${id}"`)
        );
    }
}

function assertSeats(
    players: Seat[],
    format: SeasonRow["format"],
    kind: MatchKind
): void {
    // A points match has a fixed number of seats. The mass event seats the whole roster,
    // so its seat count is the roster's, not the format's.
    if (kind === "STANDARD" && players.length !== format.competitorsPerMatch) {
        throw new MatchError(
            "VALIDATION",
            `expected ${format.competitorsPerMatch} seats, got ${players.length}`
        );
    }
    if (kind === "QUALIFICATION" && players.length < 1) {
        throw new MatchError("VALIDATION", "a qualification match needs at least one seat");
    }

    const wrongKind = players.filter((seat) => !format.allowedSeatKinds.includes(seat.kind));
    if (wrongKind.length > 0) {
        throw new MatchError(
            "VALIDATION",
            "seats use kinds this season's format does not allow",
            [`allowed: ${format.allowedSeatKinds.join(", ")}`]
        );
    }

    const seeds = players.map((seat) => seat.seed);
    if (new Set(seeds).size !== seeds.length) {
        throw new MatchError("VALIDATION", "seat seeds must be unique");
    }
}


// The format: the stage's rule decides what may sit in a match. The staff place the
// matches; the engine refuses the ones that break the bracket.
async function assertFollowsFormat(params: {
    seasonId: string;
    stageId: string;
    slot: number | null;
    players: Seat[];
}): Promise<void> {
    const playerIds = params.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []);

    const check = await checkMatchAgainstFormat({
        seasonId: params.seasonId,
        stageId: params.stageId,
        slot: params.slot,
        playerIds
    });

    if (check.checked && check.problems.length > 0) {
        throw new MatchError(
            "VALIDATION",
            `this match breaks the format of stage "${params.stageId}"`,
            check.problems
        );
    }
}


export async function createMatch(
    seasonId: string,
    input: CreateMatchInput,
    executor: Tx = db as unknown as Tx
): Promise<MatchRow> {
    validate(CreateMatchInput, input);

    const { season } = await requireMatchScope(seasonId);

    // A match created by hand carries no rulebook: it takes the season's rules, and its
    // questions are assembled from them.
    // The season's stages are its order: a match names one of them, so the standings can
    // tell how far each player got.
    const stages = season.stages ?? [];
    if (stages.length === 0) {
        throw new MatchError(
            "NOT_READY",
            "this season has no stages yet — add them before creating matches"
        );
    }
    if (!stages.some((stage) => stage.id === input.stageId)) {
        throw new MatchError(
            "VALIDATION",
            `the stage "${input.stageId}" is not one of this season's stages`,
            stages.map((stage) => stage.id)
        );
    }

    // A match created by hand carries no rulebook: it takes the season's rules. A season
    // without rules leaves the match empty — the staff assemble it later.
    const given = input.roundConfigs ?? {};
    const hasRules = Object.keys(season.roundRules ?? {}).length > 0;
    const roundConfigs = Object.keys(given).length > 0
        ? given
        : hasRules
            ? seasonRoundConfigs(season)
            : {};
    if (Object.keys(roundConfigs).length > 0) assertRoundConfigKeys(season, roundConfigs);
    if (input.players) assertSeats(input.players, season.format, input.kind ?? "STANDARD");
    if (input.players && (input.kind ?? "STANDARD") === "STANDARD") {
        await assertFollowsFormat({
            seasonId,
            stageId: input.stageId,
            slot: input.slot ?? null,
            players: input.players
        });
    }

    // The questions come from the rulebook, when it declares any. A rulebook that asks
    // for no questions leaves the match empty: the staff assemble it later.
    let entries = input.questions ?? [];
    let autoPick = input.autoPick ?? [];
    const declaresQuestions = Object.values(roundConfigs).some((config) =>
        config.turns.some((turn) => (turn.questionCount ?? 0) > 0));
    if (entries.length === 0 && autoPick.length === 0 && declaresQuestions) {
        entries = (await buildStageInputs(season, roundConfigs)).questions;
    }

    const questions = await buildQuestionCopies({
        season,
        roundConfigs,
        entries,
        autoPick
    });

    const [row] = await executor
        .insert(matches)
        .values({
            seasonId,
            kind: input.kind ?? "STANDARD",
            stageId: input.stageId,
            slot: input.slot ?? null,
            label: input.label,
            scheduledAt: new Date(input.scheduledAt),
            status: "UPCOMING",
            players: input.players ?? [],
            roundConfigs,
            questions,
            live: null,
            discord: null
        })
        .returning();
    return row;
}


export interface ListFilters {
    status?: MatchStatusValue;
}

export async function listMatches(
    seasonId: string,
    filters: ListFilters,
    page: Page
): Promise<PageResult<MatchRow>> {
    const conditions = [eq(matches.seasonId, seasonId), isNull(matches.deletedAt)];
    if (filters.status) conditions.push(eq(matches.status, filters.status));

    const where = and(...conditions);

    const [totals] = await db.select({ total: count() }).from(matches).where(where);

    const items = await db
        .select()
        .from(matches)
        .where(where)
        .orderBy(asc(matches.scheduledAt), asc(matches.id))
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


export async function getMatch(seasonId: string, matchId: string): Promise<MatchRow> {
    return requireMatch(seasonId, matchId);
}

// Lookup by match id alone: the player surface knows its match, not the season.
export async function getMatchById(matchId: string): Promise<MatchRow> {
    const [row] = await db
        .select()
        .from(matches)
        .where(and(eq(matches.id, matchId), isNull(matches.deletedAt)))
        .limit(1);
    if (!row) throw new MatchError("NOT_FOUND", `match ${matchId} not found`);
    return row;
}


export async function updateMatch(
    seasonId: string,
    matchId: string,
    patch: UpdateMatchInput
): Promise<MatchRow> {
    validate(UpdateMatchInput, patch);

    const existing = await requireMatch(seasonId, matchId);
    if (existing.status !== "UPCOMING") {
        throw new MatchError(
            "IMMUTABLE",
            `match ${matchId} is ${existing.status} and can no longer be edited`
        );
    }

    const season = await requireSeason(seasonId);
    if (patch.players) assertSeats(patch.players, season.format, existing.kind);
    if (patch.players && existing.kind === "STANDARD") {
        await assertFollowsFormat({
            seasonId,
            stageId: patch.stageId ?? existing.stageId,
            slot: existing.slot ?? null,
            players: patch.players
        });
    }
    if (patch.roundConfigs) assertRoundConfigKeys(season, patch.roundConfigs);

    const values: Partial<typeof matches.$inferInsert> = { updatedAt: new Date() };
    if (patch.stageId !== undefined) values.stageId = patch.stageId;
    if (patch.label !== undefined) values.label = patch.label;
    if (patch.scheduledAt !== undefined) values.scheduledAt = new Date(patch.scheduledAt);
    if (patch.players !== undefined) values.players = patch.players;
    if (patch.roundConfigs !== undefined) values.roundConfigs = patch.roundConfigs;

    const [row] = await db
        .update(matches)
        .set(values)
        .where(eq(matches.id, matchId))
        .returning();
    return row;
}


export async function assembleMatch(
    seasonId: string,
    matchId: string,
    input: AssembleMatchInput
): Promise<MatchRow> {
    validate(AssembleMatchInput, input);

    const existing = await requireMatch(seasonId, matchId);
    if (existing.status !== "UPCOMING") {
        throw new MatchError(
            "IMMUTABLE",
            `match ${matchId} is ${existing.status} and can no longer be assembled`
        );
    }

    const entries = input.questions ?? [];
    const autoPick = input.autoPick ?? [];
    if (entries.length === 0 && autoPick.length === 0) {
        throw new MatchError("VALIDATION", "provide questions and/or autoPick");
    }

    const season = await requireSeason(seasonId);

    const questions = await buildQuestionCopies({
        season,
        roundConfigs: existing.roundConfigs,
        entries,
        autoPick
    });

    const [row] = await db
        .update(matches)
        .set({ questions, updatedAt: new Date() })
        .where(eq(matches.id, matchId))
        .returning();
    return row;
}


export async function setMatchResults(
    seasonId: string,
    matchId: string,
    totals: Array<{ userId: string; score: number }>
): Promise<MatchRow> {
    const match = await requireMatch(seasonId, matchId);

    if (match.status === "FINISHED") {
        throw new MatchError("VALIDATION", "match is already finished; results are frozen");
    }

    const seated = match.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []);

    const given = new Set(totals.map((row) => row.userId));
    if (given.size !== totals.length) {
        throw new MatchError("VALIDATION", "totals list the same player twice");
    }
    if (seated.length !== totals.length || seated.some((userId) => !given.has(userId))) {
        throw new MatchError(
            "VALIDATION",
            "totals must cover exactly the players seated in this match",
            [`seated: ${seated.length}, given: ${totals.length}`]
        );
    }

    const results: ResultEntry[] = [...totals]
        .sort((a, b) => b.score - a.score)
        .map((row, index) => ({
            kind: "user" as const,
            userId: row.userId,
            totalScore: row.score,
            rank: index + 1,
            roundScores: {}
        }));

    const row = await db.transaction(async (tx) => {
        await tx
            .insert(matchResults)
            .values({ matchId, seasonId, results })
            .onConflictDoUpdate({
                target: matchResults.matchId,
                set: { results, computedAt: new Date() }
            });

        const [updated] = await tx
            .update(matches)
            .set({ status: "FINISHED", updatedAt: new Date() })
            .where(eq(matches.id, matchId))
            .returning();

        return updated;
    });

    // The standings are never typed in: they follow the points of the matches that were
    // played, so they are recomputed when a match ends.
    if (row.kind === "STANDARD") {
        await recomputeStandings(seasonId);
    }

    return row;
}


export async function transitionMatch(
    seasonId: string,
    matchId: string,
    next: MatchStatusValue
): Promise<MatchRow> {
    const existing = await requireMatch(seasonId, matchId);

    if (existing.status === next) return existing;

    if (!EDGES[existing.status].includes(next)) {
        throw new MatchError(
            "INVALID_TRANSITION",
            `cannot move a match from ${existing.status} to ${next}`,
            [`allowed from ${existing.status}: ${EDGES[existing.status].join(", ") || "none"}`]
        );
    }

    if (next === "LIVE" && existing.kind === "QUALIFICATION") {
        throw new MatchError(
            "INVALID_TRANSITION",
            "a qualification match is not played live: the players answer it, the staff close it"
        );
    }

    if (next === "LIVE") {
        const season = await requireSeason(seasonId);
        const shortfalls: string[] = [];

        if (existing.players.length !== season.format.competitorsPerMatch) {
            shortfalls.push(
                `seats: ${existing.players.length}/${season.format.competitorsPerMatch}`
            );
        }
        if (existing.questions.length === 0) {
            shortfalls.push("no questions assembled");
        }

        if (shortfalls.length > 0) {
            throw new MatchError(
                "NOT_READY",
                `match ${matchId} is not ready to go live`,
                shortfalls
            );
        }
    }

    const row = await db.transaction(async (tx) => {
        const [updated] = await tx
            .update(matches)
            .set({ status: next, updatedAt: new Date() })
            .where(eq(matches.id, matchId))
            .returning();

        // Going LIVE opens the live round record at the season's first round. The round's
        // engine state stays empty until the MC starts it. Idempotent: re-entering LIVE
        // never clobbers an in-progress round.
        if (next === "LIVE") {
            const season = await requireSeason(seasonId);
            const ordered = orderedMatchRounds(season.rounds, updated.roundConfigs);
            const first = nextRoundId(ordered, null);
            if (first) {
                await tx.insert(matchLive)
                    .values({ matchId, version: 0, roundId: first, state: {} })
                    .onConflictDoNothing();
            }
        }

        // Match end freezes the results in the same transaction as the status change.
        if (next === "FINISHED") {
            await scoreMatch(tx, updated);
        }

        return updated;
    });

    if (next === "FINISHED" && row.kind === "STANDARD") {
        await recomputeStandings(seasonId);
    }

    return row;
}


export async function deleteMatch(seasonId: string, matchId: string): Promise<MatchRow> {
    const existing = await requireMatch(seasonId, matchId);

    if (existing.status !== "UPCOMING") {
        throw new MatchError(
            "IMMUTABLE",
            `match ${matchId} is ${existing.status} and cannot be deleted`
        );
    }

    const [row] = await db
        .update(matches)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(matches.id, matchId))
        .returning();
    return row;
}
