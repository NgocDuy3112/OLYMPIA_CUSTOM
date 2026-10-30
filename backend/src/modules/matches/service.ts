import { randomInt } from "node:crypto";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { answers, matchLive, matchResults, matchStats, matches, scoreAdjustments, tournaments } from "../../db/schema/index.js";
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
import { tournamentRoundConfigs } from "./stage-inputs.js";
import { recomputeStandings } from "../standings/service.js";
import { checkMatchAgainstFormat } from "../bracket/service.js";

export type MatchRow = typeof matches.$inferSelect;
type TournamentRow = typeof tournaments.$inferSelect;
type MatchStatusValue = "UPCOMING" | "LIVE" | "FINISHED";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The player's door-in code: 6 chars from an unambiguous alphabet (no 0/O/1/I),
// so staff can read it off a screen and a player can type it on a phone. The
// unique index is the arbiter — retry a handful of times, then let it throw.
const JOIN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const JOIN_CODE_ATTEMPTS = 5;

export function newJoinCode(): string {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
        code += JOIN_ALPHABET[randomInt(JOIN_ALPHABET.length)];
    }
    return code;
}


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

    // Manual score corrections, read in the SAME transaction as the freeze —
    // the frozen totals must equal what the live scoreboard showed.
    const adjustmentRows = await tx
        .select({ userId: scoreAdjustments.userId, delta: scoreAdjustments.delta })
        .from(scoreAdjustments)
        .where(eq(scoreAdjustments.matchId, match.id));
    const adjustments: Record<string, number> = {};
    for (const r of adjustmentRows) {
        adjustments[r.userId] = (adjustments[r.userId] ?? 0) + r.delta;
    }

    const results = buildMatchResults({
        competitors,
        adjustments,
        answers: rows.map((r) => ({
            userId: r.userId,
            roundId: questionById.get(r.questionId)?.roundId ?? "unknown",
            pointsAwarded: r.pointsAwarded ?? 0
        }))
    });

    // A repeated transition must not duplicate frozen rows.
    await tx.insert(matchResults)
        .values({ matchId: match.id, tournamentId: match.tournamentId, results })
        .onConflictDoNothing();

    if (rows.length > 0) {
        await tx.insert(matchStats).values(rows.map((r) => {
            const question = questionById.get(r.questionId);
            return {
                matchId: match.id,
                tournamentId: match.tournamentId,
                roundId: question?.roundId ?? "unknown",
                questionId: r.questionId,
                userId: r.userId,
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
    tournament: TournamentRow;
}

async function requireTournament(tournamentId: string): Promise<TournamentRow> {
    const [row] = await db
        .select()
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!row) throw new MatchError("NOT_FOUND", `tournament ${tournamentId} not found`);
    return row;
}

export async function requireMatchScope(tournamentId: string): Promise<MatchScope> {
    const [tournament] = await db
        .select()
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!tournament) throw new MatchError("NOT_FOUND", `tournament ${tournamentId} not found`);

    return { tournament };
}

async function requireMatch(tournamentId: string, matchId: string): Promise<MatchRow> {
    const [row] = await db
        .select()
        .from(matches)
        .where(and(
            eq(matches.id, matchId),
            eq(matches.tournamentId, tournamentId),
            isNull(matches.deletedAt)
        ))
        .limit(1);
    if (!row) throw new MatchError("NOT_FOUND", `match ${matchId} not found`);
    return row;
}

function assertRoundConfigKeys(tournament: TournamentRow, roundConfigs: Record<string, RoundConfig>): void {
    const roundIds = new Set(tournament.rounds.map((round) => round.id));
    const unknown = Object.keys(roundConfigs).filter((id) => !roundIds.has(id));

    if (unknown.length > 0) {
        throw new MatchError(
            "VALIDATION",
            "roundConfigs contains rounds that are not part of this tournament",
            unknown.map((id) => `unknown round id "${id}"`)
        );
    }
}

function assertSeats(
    players: Seat[],
    format: TournamentRow["format"]
): void {
    // A points match has a fixed number of seats.
    if (players.length !== format.competitorsPerMatch) {
        throw new MatchError(
            "VALIDATION",
            `expected ${format.competitorsPerMatch} seats, got ${players.length}`
        );
    }

    const wrongKind = players.filter((seat) => !format.allowedSeatKinds.includes(seat.kind));
    if (wrongKind.length > 0) {
        throw new MatchError(
            "VALIDATION",
            "seats use kinds this tournament's format does not allow",
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
    tournamentId: string;
    stageId: string;
    slot: number | null;
    players: Seat[];
}): Promise<void> {
    const playerIds = params.players.flatMap((seat) =>
        "userId" in seat && seat.userId ? [seat.userId] : []);

    const check = await checkMatchAgainstFormat({
        tournamentId: params.tournamentId,
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
    tournamentId: string,
    input: CreateMatchInput,
    executor: Tx = db as unknown as Tx
): Promise<MatchRow> {
    validate(CreateMatchInput, input);

    const { tournament } = await requireMatchScope(tournamentId);

    // A match created by hand carries no rulebook: it takes the tournament's rules, and its
    // questions are assembled from them.
    // The tournament's stages are its order: a match names one of them, so the standings can
    // tell how far each player got.
    const stages = tournament.stages ?? [];
    if (stages.length === 0) {
        throw new MatchError(
            "NOT_READY",
            "this tournament has no stages yet — add them before creating matches"
        );
    }
    if (!stages.some((stage) => stage.id === input.stageId)) {
        throw new MatchError(
            "VALIDATION",
            `the stage "${input.stageId}" is not one of this tournament's stages`,
            stages.map((stage) => stage.id)
        );
    }

    // A match created by hand carries no rulebook: it takes the tournament's rules. A tournament
    // without rules leaves the match empty — the staff assemble it later.
    const given = input.roundConfigs ?? {};
    const hasRules = Object.keys(tournament.roundRules ?? {}).length > 0;
    const roundConfigs = Object.keys(given).length > 0
        ? given
        : hasRules
            ? tournamentRoundConfigs(tournament)
            : {};
    if (Object.keys(roundConfigs).length > 0) assertRoundConfigKeys(tournament, roundConfigs);
    if (input.players) assertSeats(input.players, tournament.format);
    if (input.players) {
        await assertFollowsFormat({
            tournamentId,
            stageId: input.stageId,
            slot: input.slot ?? null,
            players: input.players
        });
    }

    // The questions were chosen by whoever created the match (the New-match
    // picker): nothing stages itself from the rulebook anymore. A match created
    // without questions stays empty until staff assemble it.
    const entries = input.questions ?? [];

    const questions = await buildQuestionCopies({
        tournament,
        roundConfigs,
        entries
    });

    // STANDARD matches get a join code. The partial unique index owns collisions:
    // a generated clash retries, not fails.

    let row: MatchRow | undefined;
    for (let attempt = 0; row === undefined && attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
        try {
            const [inserted] = await executor
                .insert(matches)
                .values({
                    tournamentId,
                    stageId: input.stageId,
                    slot: input.slot ?? null,
                    label: input.label,
                    scheduledAt: new Date(input.scheduledAt),
                    status: "UPCOMING",
                    joinCode: newJoinCode(),
                    players: input.players ?? [],
                    roundConfigs,
                    questions,
                    live: null,
                    discord: null
                })
                .returning();
            row = inserted;
        } catch (error) {
            // Only the join-code index may be retried; anything else is real.
            const code = (error as { code?: string }).code;
            const constraint = (error as { constraint?: string }).constraint ?? "";
            const isJoinCode = code === "23505" && constraint.includes("join_code");
            if (!isJoinCode || attempt === JOIN_CODE_ATTEMPTS - 1) throw error;
        }
    }
    return row!;
}


export interface ListFilters {
    status?: MatchStatusValue;
}

export async function listMatches(
    tournamentId: string,
    filters: ListFilters,
    page: Page
): Promise<PageResult<MatchRow>> {
    const conditions = [eq(matches.tournamentId, tournamentId), isNull(matches.deletedAt)];
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


export async function getMatch(tournamentId: string, matchId: string): Promise<MatchRow> {
    return requireMatch(tournamentId, matchId);
}

// Lookup by match id alone: the player surface knows its match, not the tournament.
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
    tournamentId: string,
    matchId: string,
    patch: UpdateMatchInput
): Promise<MatchRow> {
    validate(UpdateMatchInput, patch);

    const existing = await requireMatch(tournamentId, matchId);
    if (existing.status !== "UPCOMING") {
        throw new MatchError(
            "IMMUTABLE",
            `match ${matchId} is ${existing.status} and can no longer be edited`
        );
    }

    const tournament = await requireTournament(tournamentId);
    if (patch.players) assertSeats(patch.players, tournament.format);
    if (patch.players) {
        await assertFollowsFormat({
            tournamentId,
            stageId: patch.stageId ?? existing.stageId,
            slot: existing.slot ?? null,
            players: patch.players
        });
    }
    if (patch.roundConfigs) assertRoundConfigKeys(tournament, patch.roundConfigs);

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
    tournamentId: string,
    matchId: string,
    input: AssembleMatchInput
): Promise<MatchRow> {
    validate(AssembleMatchInput, input);

    const existing = await requireMatch(tournamentId, matchId);
    if (existing.status !== "UPCOMING") {
        throw new MatchError(
            "IMMUTABLE",
            `match ${matchId} is ${existing.status} and can no longer be assembled`
        );
    }

    const entries = input.questions ?? [];
    if (entries.length === 0) {
        throw new MatchError("VALIDATION", "provide questions");
    }

    const tournament = await requireTournament(tournamentId);

    const questions = await buildQuestionCopies({
        tournament,
        roundConfigs: existing.roundConfigs,
        entries
    });

    const [row] = await db
        .update(matches)
        .set({ questions, updatedAt: new Date() })
        .where(eq(matches.id, matchId))
        .returning();
    return row;
}


export async function setMatchResults(
    tournamentId: string,
    matchId: string,
    totals: Array<{ userId: string; score: number }>
): Promise<MatchRow> {
    const match = await requireMatch(tournamentId, matchId);

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
            .values({ matchId, tournamentId, results })
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
    await recomputeStandings(tournamentId);

    return row;
}


export async function transitionMatch(
    tournamentId: string,
    matchId: string,
    next: MatchStatusValue
): Promise<MatchRow> {
    const existing = await requireMatch(tournamentId, matchId);

    if (existing.status === next) return existing;

    if (!EDGES[existing.status].includes(next)) {
        throw new MatchError(
            "INVALID_TRANSITION",
            `cannot move a match from ${existing.status} to ${next}`,
            [`allowed from ${existing.status}: ${EDGES[existing.status].join(", ") || "none"}`]
        );
    }

    if (next === "LIVE") {
        const tournament = await requireTournament(tournamentId);
        const shortfalls: string[] = [];

        if (existing.players.length !== tournament.format.competitorsPerMatch) {
            shortfalls.push(
                `seats: ${existing.players.length}/${tournament.format.competitorsPerMatch}`
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

        // Going LIVE opens the live round record at the tournament's first round. The round's
        // engine state stays empty until the MC starts it. Idempotent: re-entering LIVE
        // never clobbers an in-progress round.
        if (next === "LIVE") {
            const tournament = await requireTournament(tournamentId);
            const ordered = orderedMatchRounds(tournament.rounds, updated.roundConfigs);
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

    if (next === "FINISHED") {
        await recomputeStandings(tournamentId);
    }

    return row;
}


export async function deleteMatch(tournamentId: string, matchId: string): Promise<MatchRow> {
    const existing = await requireMatch(tournamentId, matchId);

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
