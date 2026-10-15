import { and, asc, count, eq, isNull, ne } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { seasons, tournaments } from "../../db/schema/index.js";
import { SeasonError } from "./errors.js";
import { CreateSeasonInput, UpdateSeasonInput, validate } from "./schemas.js";
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
    await requireSeason(tournamentId, seasonId);

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
