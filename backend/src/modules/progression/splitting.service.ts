import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchDraws,
    matchResults,
    matches,
    seasonPhaseResults,
    seasonPlayers,
    users
} from "../../db/schema/index.js";
import type { Progression } from "../../game/contracts/index.js";
import { createMatch } from "../matches/service.js";
import { QualificationError } from "./errors.js";
import { rankPhase2, unresolvedBlocks } from "./plan.js";
import type { TieBreak } from "./qualification.js";
import { QUALIFICATION_PHASE, requireProgression } from "./qualification.service.js";
import { newDrawSeed } from "./rng.js";
import { buildStageInputs, stageRoundConfigs } from "./round-inputs.js";
import { SPLITTING_PHASE, drawGroupsFor, stageIdFor } from "./splitting.js";
import type { MatchRow } from "../matches/service.js";
import type { AssemblyEntry } from "../matches/schemas.js";

export interface DrawSplitRoundInput {
    round: number;
    scheduledAt: string;
    label?: string;
}

export interface CreateSplittingMatchInput {
    round: number;
    slot: number;
    playerIds: string[];
    scheduledAt: string;
    label?: string;
}


export interface SplittingStageView {
    stageId: string
    seed: string | null
    groups: string[][] | null
    drawnAt: string | null
    matches: Array<{
        id: string
        slot: number | null
        label: string
        status: string
        players: string[]
    }>
}

export interface SplittingView {
    splittingRounds: number
    advance: number
    groupSize: number
    seats: number
    stages: SplittingStageView[]
    closed: boolean
    rank: Array<{ userId: string; rank: number; score: number }> | null,
    roster: Record<string, string>
}


export async function getSplittingForStaff(seasonId: string): Promise<SplittingView> {
    const { season, progression } = await requireProgression(seasonId);
    const stages: SplittingStageView[] = [];

    for (let round = 1; round <= progression.splittingRounds; round++) {
        const stage = stageIdFor(round);

        const [draw] = await db
            .select({ seed: matchDraws.seed, groups: matchDraws.groups, drawnAt: matchDraws.drawnAt })
            .from(matchDraws)
            .where(and(eq(matchDraws.seasonId, seasonId), eq(matchDraws.stageId, stage)))
            .limit(1);

        const rows = await db
            .select({
                id: matches.id,
                slot: matches.slot,
                label: matches.label,
                status: matches.status,
                players: matches.players
            })
            .from(matches)
            .where(and(
                eq(matches.seasonId, seasonId),
                eq(matches.stageId, stage),
                isNull(matches.deletedAt)
            ))
            .orderBy(asc(matches.slot));

        stages.push({
            stageId: stage,
            seed: draw?.seed ?? null,
            groups: draw?.groups ?? null,
            drawnAt: draw?.drawnAt ? draw.drawnAt.toISOString() : null,
            matches: rows.map((row) => ({
                id: row.id,
                slot: row.slot,
                label: row.label,
                status: row.status,
                players: row.players.flatMap((seat) =>
                    "userId" in seat && seat.userId ? [seat.userId] : [])
            }))
        });
    }

    const userIds = [...new Set(stages.flatMap((stage) => (stage.groups ?? []).flat()))];
    const roster = userIds.length === 0
        ? {}
        : Object.fromEntries(
            (await db
                .select({ id: users.id, displayName: users.displayName })
                .from(users)
                .where(inArray(users.id, userIds))
            ).map((row) => [row.id, row.displayName])
        );



    const rankRows = await db
        .select({ userId: seasonPhaseResults.userId, rank: seasonPhaseResults.rank, score: seasonPhaseResults.score })
        .from(seasonPhaseResults)
        .where(and(
            eq(seasonPhaseResults.seasonId, seasonId),
            eq(seasonPhaseResults.phaseId, SPLITTING_PHASE),
            eq(seasonPhaseResults.round, 2)
        ))
        .orderBy(asc(seasonPhaseResults.rank));

    return {
        splittingRounds: progression.splittingRounds,
        advance: progression.advance,
        groupSize: progression.groupSize,
        seats: season.format.competitorsPerMatch,
        stages,
        closed: rankRows.length > 0,
        rank: rankRows.length > 0 ? rankRows : null,
        roster
    };
}


export async function drawSplitRound(
    tournamentId: string,
    seasonId: string,
    input: DrawSplitRoundInput,
    actorId: string
): Promise<{ stageId: string; seed: string; groups: string[][]; matchIds: string[] }> {
    const { season, progression } = await requireProgression(seasonId);

    if (!Number.isInteger(input.round) || input.round < 1 || input.round > progression.splittingRounds) {
        throw new QualificationError(
            "VALIDATION",
            `round must be between 1 and ${progression.splittingRounds}`
        );
    }

    const stage = stageIdFor(input.round);

    if (await hasDraw(seasonId, stage)) {
        throw new QualificationError("ALREADY_SETUP", `${stage} has already been drawn`);
    }
    if (input.round > 1) {
        const previous = await stageScores(seasonId, stageIdFor(input.round - 1));
        const scored = Object.keys(previous).length;

        if (scored < progression.advance) {
            throw new QualificationError(
                "NOT_SETUP",
                `round ${input.round - 1} has scores for ${scored} players, expected ${progression.advance}`
            );
        }
    }

    const ranked = await splittingRanking(seasonId, input.round, progression);
    const seed = newDrawSeed();
    const { groups } = drawGroupsFor({
        ranked,
        groupSize: progression.groupSize,
        round: input.round,
        seed
    });

    const inputs = await buildStageInputs(season, tournamentId);

    try {
        return await db.transaction(async (tx) => {
            await tx.insert(matchDraws).values({
                seasonId,
                stageId: stage,
                seed,
                groups,
                questions: inputs.questions,
                drawnBy: actorId
            });

            const matchIds: string[] = [];
            for (const [index, group] of groups.entries()) {
                const match = await createMatch(tournamentId, seasonId, {
                    stageId: stage,
                    slot: index + 1,
                    label: input.label ?? `${stage} · match ${index + 1}`,
                    scheduledAt: input.scheduledAt,
                    roundConfigs: inputs.roundConfigs,
                    questions: inputs.questions,
                    players: group.map((userId, seat) => ({
                        kind: "user" as const,
                        userId,
                        seed: seat + 1
                    }))
                }, tx);
                matchIds.push(match.id);
            }

            return { stageId: stage, seed, groups, matchIds };
        });
    } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code
            ?? (error as { code?: string }).code;
        if (code === "23505") {
            throw new QualificationError("ALREADY_SETUP", `${stage} has already been drawn`);
        }
        throw error;
    }
}


// One match, placed by hand: the staff pick the slot and the four players themselves.
// The stage's questions are the draw's frozen set when the stage has one, so a match
// placed by hand asks the same questions as the drawn ones.
export async function createSplittingMatch(
    tournamentId: string,
    seasonId: string,
    input: CreateSplittingMatchInput
): Promise<MatchRow> {
    const { season, progression } = await requireProgression(seasonId);

    if (!Number.isInteger(input.round) || input.round < 1 || input.round > progression.splittingRounds) {
        throw new QualificationError(
            "VALIDATION",
            `round must be between 1 and ${progression.splittingRounds}`
        );
    }
    if (!Number.isInteger(input.slot) || input.slot < 1) {
        throw new QualificationError("VALIDATION", "slot must be a positive integer");
    }
    if (Number.isNaN(Date.parse(input.scheduledAt))) {
        throw new QualificationError("VALIDATION", "scheduledAt must be an ISO date-time");
    }

    const playerIds = [...new Set(input.playerIds)];
    if (playerIds.length !== input.playerIds.length) {
        throw new QualificationError("VALIDATION", "a player can only take one seat");
    }

    const seats = season.format.competitorsPerMatch;
    if (playerIds.length !== seats) {
        throw new QualificationError(
            "VALIDATION",
            `expected ${seats} players, got ${playerIds.length}`
        );
    }

    const enrolled = await db.select({ userId: seasonPlayers.userId })
        .from(seasonPlayers)
        .where(and(
            eq(seasonPlayers.seasonId, seasonId),
            inArray(seasonPlayers.userId, playerIds)
        ));
    const enrolledIds = new Set(enrolled.map((row) => row.userId));
    const missing = playerIds.filter((id) => !enrolledIds.has(id));
    if (missing.length > 0) {
        throw new QualificationError(
            "NOT_ENROLLED",
            "these players are not enrolled in this season",
            missing
        );
    }

    const stage = stageIdFor(input.round);

    const [draw] = await db.select({ questions: matchDraws.questions })
        .from(matchDraws)
        .where(and(eq(matchDraws.seasonId, seasonId), eq(matchDraws.stageId, stage)))
        .limit(1);

    const roundConfigs = stageRoundConfigs(season);
    const questions = (draw?.questions as AssemblyEntry[] | undefined)
        ?? (await buildStageInputs(season, tournamentId)).questions;

    try {
        return await createMatch(tournamentId, seasonId, {
            stageId: stage,
            slot: input.slot,
            label: input.label ?? `${stage} · match ${input.slot}`,
            scheduledAt: input.scheduledAt,
            roundConfigs,
            questions,
            players: playerIds.map((userId, seat) => ({
                kind: "user" as const,
                userId,
                seed: seat + 1
            }))
        });
    } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code
            ?? (error as { code?: string }).code;
        if (code === "23505") {
            throw new QualificationError(
                "ALREADY_SETUP",
                `slot ${input.slot} of ${stage} is already taken`
            );
        }
        throw error;
    }
}


export async function stageScores(
    seasonId: string,
    stageId: string
): Promise<Record<string, number>> {
    const rows = await db
        .select({ results: matchResults.results })
        .from(matchResults)
        .innerJoin(matches, eq(matches.id, matchResults.matchId))
        .where(and(
            eq(matchResults.seasonId, seasonId),
            eq(matches.stageId, stageId),
            isNull(matches.deletedAt)
        ));

    const scores: Record<string, number> = {};
    for (const row of rows) {
        for (const entry of row.results) {
            if (entry.kind === "user" && entry.userId) {
                scores[entry.userId] = (scores[entry.userId] ?? 0) + entry.totalScore;
            }
        }
    }
    return scores;
}


export async function splittingRanking(
    seasonId: string,
    round: number,
    progression: Progression
): Promise<string[]> {
    if (round === 1) {
        const rows = await db
            .select({ userId: seasonPhaseResults.userId })
            .from(seasonPhaseResults)
            .where(and(
                eq(seasonPhaseResults.seasonId, seasonId),
                eq(seasonPhaseResults.phaseId, QUALIFICATION_PHASE),
                eq(seasonPhaseResults.round, 1)
            ))
            .orderBy(asc(seasonPhaseResults.rank));

        if (rows.length === 0) {
            throw new QualificationError("NOT_SETUP", "qualification is not closed");
        }
        if (rows.length < progression.advance) {
            throw new QualificationError(
                "NOT_ENOUGH_PLAYERS",
                `need ${progression.advance} qualified players to draw, got ${rows.length}`
            );
        }
        return rows.slice(0, progression.advance).map((row) => row.userId);
    }

    const round1 = await stageScores(seasonId, stageIdFor(1));
    if (Object.keys(round1).length === 0) {
        throw new QualificationError("NOT_SETUP", "splitting round 1 has not been played");
    }
    return rankPhase2(round1, {});
}


export async function hasDraw(seasonId: string, stageId: string): Promise<boolean> {
    const [row] = await db
        .select({ id: matchDraws.id })
        .from(matchDraws)
        .where(and(eq(matchDraws.seasonId, seasonId), eq(matchDraws.stageId, stageId)))
        .limit(1);
    return row !== undefined;
}


export async function closeSplitting(
    seasonId: string,
    options: { tieBreaks?: TieBreak[] } = {}
): Promise<{ rows: Array<{ userId: string; rank: number; score: number }> }> {
    const { progression } = await requireProgression(seasonId);

    const already = await db
        .select({ userId: seasonPhaseResults.userId })
        .from(seasonPhaseResults)
        .where(and(
            eq(seasonPhaseResults.seasonId, seasonId),
            eq(seasonPhaseResults.phaseId, SPLITTING_PHASE),
            eq(seasonPhaseResults.round, 2)
        ))
        .limit(1);
    if (already.length > 0) {
        throw new QualificationError("CLOSED", "splitting is already closed");
    }

    const round1 = await stageScores(seasonId, stageIdFor(1));
    const round2 = await stageScores(seasonId, stageIdFor(2));

    if (Object.keys(round2).length < progression.advance) {
        throw new QualificationError(
            "NOT_SETUP",
            `splitting round 2 has scores for ${Object.keys(round2).length} players, expected ${progression.advance}`
        );
    }

    const missingFromRound1 = Object.keys(round2).filter((playerId) => !(playerId in round1));
    if (missingFromRound1.length > 0) {
        throw new QualificationError(
            "NOT_SETUP",
            "splitting round 1 has no score for some players who played round 2",
            missingFromRound1
        );
    }

    const entries = rankPhase2(round1, round2).map((playerId) => ({
        playerId,
        key: `${round2[playerId] ?? 0}|${round1[playerId] ?? 0}`
    }));

    const unresolved = unresolvedBlocks(entries, progression.groupSize);
    const supplied = new Set((options.tieBreaks ?? []).map((tb) => [...tb.players].sort().join("|")));
    const missing = unresolved.filter((group) => !supplied.has([...group].sort().join("|")));
    if (missing.length > 0) {
        throw new QualificationError(
            "TIES_UNRESOLVED",
            "a tie spans a ladder seeding block; supply an order from a tie-break turn",
            missing.map((group) => group.join(", "))
        );
    }

    const tieRank = new Map<string, number>();
    for (const tieBreak of options.tieBreaks ?? []) {
        tieBreak.order.forEach((playerId, position) => tieRank.set(playerId, position));
    }

    const ranked = [...entries].sort((a, b) => {
        const [aRound2, aRound1] = a.key.split("|").map(Number);
        const [bRound2, bRound1] = b.key.split("|").map(Number);
        if (aRound2 !== bRound2) return bRound2 - aRound2;
        if (aRound1 !== bRound1) return bRound1 - aRound1;
        return (tieRank.get(a.playerId) ?? 0) - (tieRank.get(b.playerId) ?? 0);
    });

    const rows = ranked.map((entry, index) => ({
        userId: entry.playerId,
        rank: index + 1,
        score: round2[entry.playerId] ?? 0
    }));

    try {
        await db.insert(seasonPhaseResults).values(rows.map((row) => ({
            seasonId,
            phaseId: SPLITTING_PHASE,
            round: 2,
            userId: row.userId,
            score: row.score,
            rank: row.rank
        })));
    } catch (error) {
        const code = (error as { cause?: { code?: string } }).cause?.code
            ?? (error as { code?: string }).code;
        if (code === "23505") {
            throw new QualificationError("CLOSED", "splitting is already closed");
        }
        throw error;
    }

    return { rows };
}