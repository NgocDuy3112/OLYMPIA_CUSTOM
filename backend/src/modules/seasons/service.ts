import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { seasons, tournaments } from "../../db/schema/index.js";
import { SeasonError } from "./errors.js";
import { CreateSeasonInput, UpdateSeasonInput, validate } from "./schemas.js";
import { assertValidProgression, RoundConfig } from "../../game/contracts/index.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";

type SeasonRow = typeof seasons.$inferSelect;


export async function requireParent(tournamentId: string): Promise<typeof tournaments.$inferSelect> {
    const [row] = await db
        .select()
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!row) throw new SeasonError("NOT_FOUND", `tournament ${tournamentId} not found`);
    return row;
}


function assertRoundRules(
    rounds: Array<{ id: string }>,
    rules: Record<string, RoundConfig>
): void {
    const known = new Set(rounds.map((round) => round.id));
    const unknown = Object.keys(rules).filter((id) => !known.has(id));
    if (unknown.length > 0) {
        throw new SeasonError(
            "VALIDATION",
            "roundRules names rounds this season does not have",
            unknown.map((id) => `unknown round id "${id}"`)
        );
    }

    for (const [roundId, config] of Object.entries(rules)) {
        if (config.allowedKinds.length === 0) {
            throw new SeasonError("VALIDATION", `round "${roundId}" allows no question kinds`);
        }
        const turnIds = config.turns.map((turn) => turn.id);
        if (new Set(turnIds).size !== turnIds.length) {
            throw new SeasonError("VALIDATION", `round "${roundId}" has a duplicate turn id`);
        }
    }
}

async function requireSeason(tournamentId: string, seasonId: string): Promise<SeasonRow> {
    const [row] = await db
        .select()
        .from(seasons)
        .where(and(
            eq(seasons.id, seasonId),
            eq(seasons.tournamentId, tournamentId),
            isNull(seasons.deletedAt)
        ))
        .limit(1);
    if (!row) throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
    return row;
}


export async function createSeason(
    tournamentId: string,
    input: CreateSeasonInput
): Promise<SeasonRow> {
    validate(CreateSeasonInput, input);
    const parent = await requireParent(tournamentId);
    const progression = input.progression ?? parent.defaultProgression ?? null;
    const rounds = input.rounds ?? parent.defaultRounds;
    if (input.roundRules) assertRoundRules(rounds, input.roundRules);
    if (progression) assertValidProgression(progression);

    return db.transaction(async (tx) => {
        if (input.current) {
            await tx.update(seasons)
                .set({ current: false })
                .where(and(
                    eq(seasons.tournamentId, tournamentId),
                    eq(seasons.current, true)
                ));
        }

        const [row] = await tx.insert(seasons).values({
            tournamentId,
            name: input.name,
            rounds: input.rounds ?? parent.defaultRounds,
            format: input.format ?? parent.defaultFormat,
            placementTiers: input.placementTiers ?? parent.defaultPlacementTiers,
            progression,
            roundRules: input.roundRules ?? null,
            stages: input.stages,
            current: input.current ?? false
        }).returning();
        return row;
    });
}


export interface ListFilters {
    current?: boolean;
}


export async function listSeasons(
    tournamentId: string,
    filters: ListFilters,
    page: Page
): Promise<PageResult<SeasonRow>> {
    await requireParent(tournamentId);

    const conditions = [
        eq(seasons.tournamentId, tournamentId),
        isNull(seasons.deletedAt)
    ];

    if (filters.current !== undefined) {
        conditions.push(eq(seasons.current, filters.current));
    }

    const where = and(...conditions);

    const [totals] = await db
        .select({ total: count() })
        .from(seasons)
        .where(where);

    const items = await db
        .select()
        .from(seasons)
        .where(where)
        .orderBy(asc(seasons.createdAt))
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


export async function getSeason(tournamentId: string, seasonId: string): Promise<SeasonRow> {
    await requireParent(tournamentId);
    return requireSeason(tournamentId, seasonId);
}


export async function updateSeason(
    tournamentId: string,
    seasonId: string,
    patch: UpdateSeasonInput
): Promise<SeasonRow> {
    validate(UpdateSeasonInput, patch);
    await requireParent(tournamentId);
    const existing = await requireSeason(tournamentId, seasonId);

    const frozen = existing.qualificationQuestions !== null || existing.closedAt !== null;

    const changesProgression = patch.progression !== undefined
        && JSON.stringify(patch.progression) !== JSON.stringify(existing.progression);
    const changesRules = patch.roundRules !== undefined
        && JSON.stringify(patch.roundRules) !== JSON.stringify(existing.roundRules);

    if ((changesProgression || changesRules) && frozen) {
        throw new SeasonError(
            "CONFLICT",
            "progression and round rules are frozen once qualification starts"
        );
    }
    if (changesProgression) assertValidProgression(patch.progression!);
    if (patch.roundRules) assertRoundRules(existing.rounds, patch.roundRules);

    return db.transaction(async (tx) => {
        if (patch.current === true) {
            await tx.update(seasons)
                .set({ current: false })
                .where(and(
                    eq(seasons.tournamentId, tournamentId),
                    eq(seasons.current, true),
                    ne(seasons.id, seasonId)
                ));
        }

        const [row] = await tx.update(seasons)
            .set({ ...patch, updatedAt: new Date() })
            .where(and(
                eq(seasons.id, seasonId),
                eq(seasons.tournamentId, tournamentId),
                isNull(seasons.deletedAt)
            ))
            .returning();
        if (!row) throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
        return row;
    });
}


export async function deleteSeason(tournamentId: string, seasonId: string): Promise<SeasonRow> {
    await requireParent(tournamentId);

    const [row] = await db
        .update(seasons)
        .set({ deletedAt: new Date(), updatedAt: new Date(), current: false })
        .where(and(
            eq(seasons.id, seasonId),
            eq(seasons.tournamentId, tournamentId),
            isNull(seasons.deletedAt)
        ))
        .returning();
    if (!row) throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
    return row;
}
