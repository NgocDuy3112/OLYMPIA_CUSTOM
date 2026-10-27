import { and, asc, count, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "../../db/pool.js";
import { matches, questionBank, tournaments, users } from "../../db/schema/index.js";
import { TournamentError } from "./errors.js";
import { CreateTournamentInput, UpdateTournamentInput, validate } from "./schemas.js";
import { RoundConfig } from "../../game/contracts/index.js";
import { pageResult, type Page, type PageResult } from "../../lib/pagination.js";

type TournamentRow = typeof tournaments.$inferSelect;


// A slug from a name: what the tournament is called in a URL.
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
    const base = slugify(name) || "tournament";

    for (let attempt = 0; attempt < 100; attempt++) {
        const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
        const [taken] = await db.select({ id: tournaments.id })
            .from(tournaments)
            .where(eq(tournaments.slug, candidate))
            .limit(1);
        if (!taken || taken.id === exceptId) return candidate;
    }

    throw new TournamentError("CONFLICT", `could not find a free slug for "${name}"`);
}


function assertRoundRules(
    rounds: Array<{ id: string }>,
    rules: Record<string, RoundConfig>
): void {
    const known = new Set(rounds.map((round) => round.id));
    const unknown = Object.keys(rules).filter((id) => !known.has(id));
    if (unknown.length > 0) {
        throw new TournamentError(
            "VALIDATION",
            "roundRules names rounds this tournament does not have",
            unknown.map((id) => `unknown round id "${id}"`)
        );
    }

    for (const [roundId, config] of Object.entries(rules)) {
        if (config.allowedKinds.length === 0) {
            throw new TournamentError("VALIDATION", `round "${roundId}" allows no question kinds`);
        }
        const turnIds = config.turns.map((turn) => turn.id);
        if (new Set(turnIds).size !== turnIds.length) {
            throw new TournamentError("VALIDATION", `round "${roundId}" has a duplicate turn id`);
        }
    }
}

export async function requireTournament(tournamentId: string): Promise<TournamentRow> {
    const [row] = await db
        .select()
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    if (!row) throw new TournamentError("NOT_FOUND", `tournament ${tournamentId} not found`);
    return row;
}


// Tags are a QUESTION-bank concept (which bank rows a tournament may assemble),
// not something the tournament UI asks for. A caller that passes no tags gets the
// whole published bank — DEMO rows stay quarantined unless a caller opts in by
// passing tags explicitly (scripts, MCP, tests).
async function defaultTags(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]): Promise<string[]> {
    const rows = await tx
        .selectDistinct({ tag: questionBank.tag })
        .from(questionBank)
        .where(and(eq(questionBank.status, "PUBLISHED"), ne(questionBank.tag, "DEMO")));
    return rows.map((r: { tag: string }) => r.tag);
}

export async function createTournament(
    ownerId: string,
    input: CreateTournamentInput
): Promise<TournamentRow> {
    validate(CreateTournamentInput, input);
    const slug = await uniqueSlug(input.name);

    return db.transaction(async (tx) => {
        if (input.current) {
            await tx.update(tournaments)
                .set({ current: false })
                .where(and(eq(tournaments.ownerId, ownerId), eq(tournaments.current, true)));
        }

        const [row] = await tx.insert(tournaments).values({
            ownerId,
            name: input.name,
            slug,
            visibility: input.visibility ?? "PUBLIC",
            tags: input.tags && input.tags.length > 0 ? input.tags : await defaultTags(tx),
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


// The tournaments of the portal: every public one, and the private ones of an admin.
export async function listTournaments(
    filters: ListFilters,
    page: Page,
    viewer?: { id: string; role: string }
): Promise<PageResult<TournamentRow>> {
    const conditions = [isNull(tournaments.deletedAt)];

    if (filters.current !== undefined) {
        conditions.push(eq(tournaments.current, filters.current));
    }
    if (filters.mine) {
        conditions.push(eq(tournaments.ownerId, filters.ownerId ?? ""));
    }

    if (viewer && viewer.role !== "ADMIN") {
        conditions.push(or(eq(tournaments.visibility, "PUBLIC"), eq(tournaments.ownerId, viewer.id))!);
    }

    const where = and(...conditions);

    const [totals] = await db
        .select({ total: count() })
        .from(tournaments)
        .where(where);

    const items = await db
        .select()
        .from(tournaments)
        .where(where)
        .orderBy(asc(tournaments.createdAt))
        .limit(page.limit)
        .offset(page.offset);

    return pageResult(items, Number(totals?.total ?? 0), page);
}


export async function getTournament(tournamentId: string): Promise<TournamentRow> {
    return requireTournament(tournamentId);
}


// Has any match in this tournament been assembled yet?
async function hasAssembledMatch(tournamentId: string): Promise<boolean> {
    const [row] = await db.select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.tournamentId, tournamentId), isNull(matches.deletedAt)))
        .limit(1);
    return row !== undefined;
}


export async function updateTournament(
    tournamentId: string,
    patch: UpdateTournamentInput
): Promise<TournamentRow> {
    validate(UpdateTournamentInput, patch);
    const existing = await requireTournament(tournamentId);

    // The rulebook is frozen once a match has been assembled: a running event must not
    // depend on a later edit.
    const frozen = existing.closedAt !== null || await hasAssembledMatch(tournamentId);

    const changesRules = patch.roundRules !== undefined
        && JSON.stringify(patch.roundRules) !== JSON.stringify(existing.roundRules);
    const changesStages = patch.stages !== undefined
        && JSON.stringify(patch.stages) !== JSON.stringify(existing.stages);

    // The stages are the tournament's order. Changing it would rewrite the places, so it is
    // frozen once the tournament is closed.
    if (changesStages && existing.closedAt !== null) {
        throw new TournamentError("CONFLICT", "the stages are frozen once the tournament is closed");
    }

    if (changesRules && frozen) {
        throw new TournamentError(
            "CONFLICT",
            "round rules are frozen once a match has been assembled"
        );
    }
    if (patch.roundRules) assertRoundRules(existing.rounds, patch.roundRules);

    const values: Partial<typeof tournaments.$inferInsert> = { ...patch, updatedAt: new Date() };
    if (patch.name !== undefined) {
        delete (values as { slug?: string }).slug;
        values.slug = await uniqueSlug(patch.name, tournamentId);
    }

    return db.transaction(async (tx) => {
        if (patch.current === true) {
            await tx.update(tournaments)
                .set({ current: false })
                .where(and(
                    eq(tournaments.ownerId, existing.ownerId),
                    eq(tournaments.current, true),
                    ne(tournaments.id, tournamentId)
                ));
        }

        const [row] = await tx.update(tournaments)
            .set(values)
            .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
            .returning();
        if (!row) throw new TournamentError("NOT_FOUND", `tournament ${tournamentId} not found`);
        return row;
    });
}


export async function deleteTournament(tournamentId: string): Promise<TournamentRow> {
    const [row] = await db
        .update(tournaments)
        .set({ deletedAt: new Date(), updatedAt: new Date(), current: false })
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .returning();
    if (!row) throw new TournamentError("NOT_FOUND", `tournament ${tournamentId} not found`);
    return row;
}


// The staff of a tournament: its owner, and the admins.
export async function tournamentStaff(tournamentId: string): Promise<string[]> {
    const [row] = await db.select({ ownerId: tournaments.ownerId })
        .from(tournaments)
        .where(and(eq(tournaments.id, tournamentId), isNull(tournaments.deletedAt)))
        .limit(1);
    return row ? [row.ownerId] : [];
}
