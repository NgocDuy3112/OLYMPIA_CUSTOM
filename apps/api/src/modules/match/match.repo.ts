import { and, desc, eq } from "@oc/db";
import {
    db,
    matches,
    matchPlayerPositions,
    tournaments,
    users,
} from "@oc/db";
import { makeMatchCode, ocNumberFromFormat } from "@oc/shared";

export interface MatchRow {
    id: string;
    matchSlug: string;
    matchCode: string;
    matchPin: string;
    matchName: string;
    matchStatus: string;
    tournamentId: string | null;
    scheduledAt?: Date | string | null;
    venue?: string | null;
    matchLabel?: string | null;
    phaseId?: string | null;
}

export interface MatchPlayerRow {
    position: number | null;
    userCode: string;
    userName: string;
    userId: string;
}

export interface MatchRepo {
    list(tournamentCode?: string): Promise<MatchRow[]>;
    findBySlug(slug: string): Promise<MatchRow | null>;
    findByPin(pin: string): Promise<MatchRow | null>;
    findByCode(matchCode: string): Promise<MatchRow | null>;
    create(input: {
        matchName: string;
        tournamentCode?: string;
        createdBy: string;
        scheduledAt?: string | Date | null;
        venue?: string | null;
        matchLabel?: string | null;
        phaseId?: string | null;
    }): Promise<MatchRow>;
    update(
        slug: string,
        updates: {
            matchName?: string;
            matchStatus?: string;
            videoUrl?: string | null;
            tournamentFormat?: string;
            tournamentCode?: string | null;
            matchPin?: string;
            scheduledAt?: string | Date | null;
            venue?: string | null;
            matchLabel?: string | null;
            phaseId?: string | null;
        },
    ): Promise<MatchRow | null>;
    listPlayers(matchId: string): Promise<MatchPlayerRow[]>;
    upsertPlayer(
        slug: string,
        input: { userCode: string; position: number },
    ): Promise<{ matchId: string; playerId: string }>;
}

function generatePin(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function resolveTournament(
    tournamentCode: string,
): Promise<{ id: string; tournamentFormat: string | null } | null> {
    const rows = await db
        .select({ id: tournaments.id, tournamentFormat: tournaments.tournamentFormat })
        .from(tournaments)
        .where(
            and(
                eq(tournaments.tournamentCode, tournamentCode),
                eq(tournaments.isDeleted, false),
            ),
        )
        .limit(1);
    return (rows[0] as { id: string; tournamentFormat: string | null } | undefined) ?? null;
}

async function resolveTournamentId(
    tournamentCode: string,
): Promise<string | null> {
    const row = await resolveTournament(tournamentCode);
    return row?.id ?? null;
}

export const drizzleMatchRepo: MatchRepo = {
    async list(tournamentCode?: string): Promise<MatchRow[]> {
        let tournamentId: string | null = null;
        if (tournamentCode) {
            tournamentId = await resolveTournamentId(tournamentCode);
            if (!tournamentId) return [];
        }
        const conditions = [eq(matches.isDeleted, false)];
        if (tournamentId) conditions.push(eq(matches.tournamentId, tournamentId));
        const rows = await db
            .select()
            .from(matches)
            .where(and(...conditions))
            .orderBy(desc(matches.createdAt));
        return rows as MatchRow[];
    },

    async findBySlug(slug: string): Promise<MatchRow | null> {
        const rows = await db
            .select()
            .from(matches)
            .where(and(eq(matches.matchSlug, slug), eq(matches.isDeleted, false)))
            .limit(1);
        return (rows[0] as MatchRow | undefined) ?? null;
    },

    async findByPin(pin: string): Promise<MatchRow | null> {
        const rows = await db
            .select()
            .from(matches)
            .where(and(eq(matches.matchPin, pin), eq(matches.isDeleted, false)))
            .limit(1);
        return (rows[0] as MatchRow | undefined) ?? null;
    },

    async findByCode(matchCode: string): Promise<MatchRow | null> {
        const rows = await db
            .select()
            .from(matches)
            .where(and(eq(matches.matchCode, matchCode), eq(matches.isDeleted, false)))
            .limit(1);
        return (rows[0] as MatchRow | undefined) ?? null;
    },

    async create(input: {
        matchName: string;
        tournamentCode?: string;
        createdBy: string;
        scheduledAt?: string | Date | null;
        venue?: string | null;
        matchLabel?: string | null;
        phaseId?: string | null;
    }): Promise<MatchRow> {
        let tournamentId: string | null = null;
        let ocNumber = "3";
        if (input.tournamentCode) {
            const t = await resolveTournament(input.tournamentCode);
            tournamentId = t?.id ?? null;
            if (t?.tournamentFormat) ocNumber = ocNumberFromFormat(t.tournamentFormat);
            else {
                const m = input.tournamentCode.toUpperCase().match(/^OC(\d+)_T/);
                if (m) ocNumber = m[1];
            }
        }
        const matchCode = makeMatchCode(ocNumber, Date.now().toString(36).toUpperCase());
        const result = await db
            .insert(matches)
            .values({
                matchCode,
                matchPin: generatePin(),
                matchName: input.matchName,
                tournamentId,
                createdBy: input.createdBy,
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
                venue: input.venue?.slice(0, 200) ?? undefined,
                matchLabel: input.matchLabel?.slice(0, 20) ?? undefined,
                phaseId: input.phaseId ?? undefined,
            })
            .returning();
        return result[0] as MatchRow;
    },

    async update(
        slug: string,
        updates: {
            matchName?: string;
            matchStatus?: string;
            videoUrl?: string | null;
            tournamentFormat?: string;
            tournamentCode?: string | null;
            matchPin?: string;
            scheduledAt?: string | Date | null;
            venue?: string | null;
            matchLabel?: string | null;
            phaseId?: string | null;
        },
    ): Promise<MatchRow | null> {
        const values: Record<string, unknown> = { updatedAt: new Date() };
        if (updates.matchName) values.matchName = updates.matchName;
        if (updates.matchStatus) values.matchStatus = updates.matchStatus;
        if (updates.videoUrl !== undefined) values.videoUrl = updates.videoUrl;
        if (updates.tournamentFormat)
            values.tournamentFormat = updates.tournamentFormat;
        if (updates.matchPin) values.matchPin = updates.matchPin;
        if (updates.scheduledAt !== undefined)
            values.scheduledAt = updates.scheduledAt ? new Date(updates.scheduledAt) : null;
        if (updates.venue !== undefined) values.venue = updates.venue;
        if (updates.matchLabel !== undefined) values.matchLabel = updates.matchLabel;
        if (updates.phaseId !== undefined) values.phaseId = updates.phaseId;
        if (updates.tournamentCode !== undefined) {
            values.tournamentId =
                updates.tournamentCode === null
                    ? null
                    : await resolveTournamentId(updates.tournamentCode);
        }
        const result = await db
            .update(matches)
            .set(values)
            .where(and(eq(matches.matchSlug, slug), eq(matches.isDeleted, false)))
            .returning();
        return (result[0] as MatchRow | undefined) ?? null;
    },

    async listPlayers(matchId: string): Promise<MatchPlayerRow[]> {
        const rows = await db
            .select({
                position: matchPlayerPositions.position,
                userCode: users.userCode,
                userName: users.userName,
                userId: users.id,
            })
            .from(matchPlayerPositions)
            .innerJoin(users, eq(matchPlayerPositions.playerId, users.id))
            .where(eq(matchPlayerPositions.matchId, matchId))
            .orderBy(matchPlayerPositions.position);
        return rows;
    },

    async upsertPlayer(
        slug: string,
        input: { userCode: string; position: number },
    ): Promise<{ matchId: string; playerId: string }> {
        const matchRows = await db
            .select({ id: matches.id, tournamentId: matches.tournamentId })
            .from(matches)
            .where(and(eq(matches.matchSlug, slug), eq(matches.isDeleted, false)))
            .limit(1);
        if (matchRows.length === 0) throw new Error("Match not found");
        const userRows = await db
            .select({ id: users.id, role: users.role })
            .from(users)
            .where(
                and(eq(users.userCode, input.userCode), eq(users.isDeleted, false)),
            )
            .limit(1);
        if (userRows.length === 0) throw new Error("User not found");
        if (userRows[0].role === "admin" || userRows[0].role === "operator") {
            throw new Error(`Role '${userRows[0].role}' cannot play in a match`);
        }
        const existing = await db
            .select()
            .from(matchPlayerPositions)
            .where(
                and(
                    eq(matchPlayerPositions.matchId, matchRows[0].id),
                    eq(matchPlayerPositions.playerId, userRows[0].id),
                ),
            )
            .limit(1);
        if (existing.length > 0) {
            await db
                .update(matchPlayerPositions)
                .set({ position: input.position })
                .where(eq(matchPlayerPositions.id, existing[0].id));
        } else {
            await db.insert(matchPlayerPositions).values({
                matchId: matchRows[0].id,
                playerId: userRows[0].id,
                position: input.position,
            });
        }
        return { matchId: matchRows[0].id, playerId: userRows[0].id };
    },
};

export function createInMemoryMatchRepo(
    seed: MatchRow[] = [],
): MatchRepo & { rows: MatchRow[] } {
    const rows = [...seed];
    return {
        rows,
        async list() {
            return [...rows];
        },
        async findBySlug(slug) {
            return rows.find((r) => r.matchSlug === slug) ?? null;
        },
        async findByPin(pin) {
            return rows.find((r) => r.matchPin === pin) ?? null;
        },
        async findByCode(matchCode) {
            return rows.find((r) => r.matchCode === matchCode) ?? null;
        },
        async create(input) {
            const row: MatchRow = {
                id: `mem-${rows.length + 1}`,
                matchSlug: `slug-${rows.length + 1}`,
                matchCode: makeMatchCode(3, `MEM${rows.length + 1}`),
                matchPin: "000000",
                matchName: input.matchName,
                matchStatus: "setup",
                tournamentId: null,
                scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
                venue: input.venue ?? null,
                matchLabel: input.matchLabel ?? null,
                phaseId: input.phaseId ?? null,
            };
            rows.push(row);
            return row;
        },
        async update(slug, updates) {
            const row = rows.find((r) => r.matchSlug === slug);
            if (!row) return null;
            Object.assign(row, {
                ...updates,
                scheduledAt:
                    updates.scheduledAt !== undefined
                        ? updates.scheduledAt
                            ? new Date(updates.scheduledAt)
                            : null
                        : row.scheduledAt,
            });
            return row;
        },
        async listPlayers() {
            return [];
        },
        async upsertPlayer() {
            return { matchId: "mem-match", playerId: "mem-player" };
        },
    };
}
