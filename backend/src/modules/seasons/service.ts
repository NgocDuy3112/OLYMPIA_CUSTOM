import { and, asc, count, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matches, seasons, users } from "../../db/schema/index.js";
import { SeasonError } from "./errors.js";
import { CreateSeasonInput, UpdateSeasonInput, validate } from "./schemas.js";
import { RoundConfig } from "../../game/contracts/index.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";

type SeasonRow = typeof seasons.$inferSelect;


// A slug from a name: what the season is called in a URL.
export function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100);
}

// A slug nobody else has: the name's, then the name's with a number.
async function uniqueSlug(name: string, exceptId?: string): Promise<string> {
    const base = slugify(name) || "season";

    for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const [taken] = await db.select({ id: seasons.id })
            .from(seasons)
            .where(eq(seasons.slug, candidate))
            .limit(1);
        if (!taken || taken.id === exceptId) return candidate;
    }

    throw new SeasonError("CONFLICT", `could not find a free slug for "${name}"`);
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

export async function requireSeason(seasonId: string): Promise<SeasonRow> {
    const [row] = await db
        .select()
        .from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    if (!row) throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
    return row;
}


export async function createSeason(
    ownerId: string,
    input: CreateSeasonInput
): Promise<SeasonRow> {
    validate(CreateSeasonInput, input);
    const slug = await uniqueSlug(input.name);

    return db.transaction(async (tx) => {
        if (input.current) {
            await tx.update(seasons)
                .set({ current: false })
                .where(and(eq(seasons.ownerId, ownerId), eq(seasons.current, true)));
        }

        const [row] = await tx.insert(seasons).values({
            ownerId,
            name: input.name,
            slug,
            visibility: input.visibility ?? "PUBLIC",
            tags: input.tags ?? [],
            rounds: input.rounds ?? [],
            format: input.format ?? {
                competitorsPerMatch: 4,
                allowedSeatKinds: ["user"],
                teamSize: null,
                teamAggregation: null,
                teamCountAggregation: null
            },
            placementTiers: input.placementTiers ?? [],
            roundRules: input.roundRules ?? null,
            stages: input.stages ?? [],
            current: input.current ?? false
        }).returning();
        return row;
    });
}


export interface ListFilters {
    current?: boolean;
    mine?: boolean;
    ownerId?: string;
}


// The seasons of the portal: every public one, and the private ones of an admin.
export async function listSeasons(
    filters: ListFilters,
    page: Page,
    viewer?: { id: string; role: string }
): Promise<PageResult<SeasonRow>> {
    const conditions = [isNull(seasons.deletedAt)];

    if (filters.current !== undefined) {
        conditions.push(eq(seasons.current, filters.current));
    }
    if (filters.mine) {
        conditions.push(eq(seasons.ownerId, filters.ownerId ?? ""));
    }

    if (viewer && viewer.role !== "ADMIN") {
        conditions.push(or(eq(seasons.visibility, "PUBLIC"), eq(seasons.ownerId, viewer.id))!);
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


export async function getSeason(seasonId: string): Promise<SeasonRow> {
    return requireSeason(seasonId);
}


// Has any match in this season been assembled yet?
async function hasAssembledMatch(seasonId: string): Promise<boolean> {
    const [row] = await db.select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.seasonId, seasonId), isNull(matches.deletedAt)))
        .limit(1);
    return row !== undefined;
}


export async function updateSeason(
    seasonId: string,
    patch: UpdateSeasonInput
): Promise<SeasonRow> {
    validate(UpdateSeasonInput, patch);
    const existing = await requireSeason(seasonId);

    // The rulebook is frozen once a match has been assembled: a running event must not
    // depend on a later edit.
    const frozen = existing.closedAt !== null || await hasAssembledMatch(seasonId);

    const changesRules = patch.roundRules !== undefined
        && JSON.stringify(patch.roundRules) !== JSON.stringify(existing.roundRules);
    const changesStages = patch.stages !== undefined
        && JSON.stringify(patch.stages) !== JSON.stringify(existing.stages);

    // The stages are the season's order. Changing it would rewrite the places, so it is
    // frozen once the season is closed.
    if (changesStages && existing.closedAt !== null) {
        throw new SeasonError("CONFLICT", "the stages are frozen once the season is closed");
    }

    if (changesRules && frozen) {
        throw new SeasonError(
            "CONFLICT",
            "round rules are frozen once a match has been assembled"
        );
    }
    if (patch.roundRules) assertRoundRules(existing.rounds, patch.roundRules);

    const values: Partial<typeof seasons.$inferInsert> = { ...patch, updatedAt: new Date() };
    if (patch.name !== undefined) {
        delete (values as { slug?: string }).slug;
        values.slug = await uniqueSlug(patch.name, seasonId);
    }

    return db.transaction(async (tx) => {
        if (patch.current === true) {
            await tx.update(seasons)
                .set({ current: false })
                .where(and(
                    eq(seasons.ownerId, existing.ownerId),
                    eq(seasons.current, true),
                    ne(seasons.id, seasonId)
                ));
        }

        const [row] = await tx.update(seasons)
            .set(values)
            .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
            .returning();
        if (!row) throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
        return row;
    });
}


export async function deleteSeason(seasonId: string): Promise<SeasonRow> {
    const [row] = await db
        .update(seasons)
        .set({ deletedAt: new Date(), updatedAt: new Date(), current: false })
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .returning();
    if (!row) throw new SeasonError("NOT_FOUND", `season ${seasonId} not found`);
    return row;
}


// The staff of a season: its owner, and the admins.
export async function seasonStaff(seasonId: string): Promise<string[]> {
    const [row] = await db.select({ ownerId: seasons.ownerId })
        .from(seasons)
        .where(and(eq(seasons.id, seasonId), isNull(seasons.deletedAt)))
        .limit(1);
    return row ? [row.ownerId] : [];
}
