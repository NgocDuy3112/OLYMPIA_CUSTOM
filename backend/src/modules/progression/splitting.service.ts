import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/pool.js";
import {
    matchDraws,
    matchResults,
    matches,
    seasonPhaseResults
} from "../../db/schema/index.js";
import type { Progression } from "../../game/contracts/index.js";
import { createMatch } from "../matches/service.js";
import { QualificationError } from "./errors.js";
import { rankPhase2, unresolvedBlocks } from "./plan.js";
import type { TieBreak } from "./qualification.js";
import { QUALIFICATION_PHASE, requireProgression } from "./qualification.service.js";
import { newDrawSeed } from "./rng.js";
import { buildStageInputs } from "./round-inputs.js";
import { SPLITTING_PHASE, drawGroupsFor, stageIdFor } from "./splitting.js";

export interface DrawSplitRoundInput {
    round: number;
    scheduledAt: string;
    label?: string;
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
        // Two clicks at once: the pre-check above passed for both, and
        // match_draws_stage_unique caught the loser.
        const code = (error as { cause?: { code?: string } }).cause?.code
            ?? (error as { code?: string }).code;
        if (code === "23505") {
            throw new QualificationError("ALREADY_SETUP", `${stage} has already been drawn`);
        }
        throw error;
    }
}


// Total match points per player for one stage, summed across that stage's matches.
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