import { and, desc, eq } from "drizzle-orm";
import {
    db,
    matches,
    matchPlayerPositions,
    tournaments,
    users,
} from "@oc/db";

export interface MatchRow {
    id: string;
    matchSlug: string;
    matchCode: string;
    matchPin: string;
    matchName: string;
    matchStatus: string;
    tournamentId: string | null;
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

async function resolveTournamentId(
    tournamentCode: string,
): Promise<string | null> {
    const rows = await db
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
            and(
                eq(tournaments.tournamentCode, tournamentCode),
                eq(tournaments.isDeleted, false),
            ),
        )
        .limit(1);
    return rows[0]?.id ?? null;
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
    }): Promise<MatchRow> {
        let tournamentId: string | null = null;
        if (input.tournamentCode) {
            tournamentId = await resolveTournamentId(input.tournamentCode);
        }
        const matchCode = `OC3_M_${Date.now().toString(36).toUpperCase()}`;
        const result = await db
            .insert(matches)
            .values({
                matchCode,
                matchPin: generatePin(),
                matchName: input.matchName,
                tournamentId,
                createdBy: input.createdBy,
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
        },
    ): Promise<MatchRow | null> {
        const values: Record<string, unknown> = { updatedAt: new Date() };
        if (updates.matchName) values.matchName = updates.matchName;
        if (updates.matchStatus) values.matchStatus = updates.matchStatus;
        if (updates.videoUrl !== undefined) values.videoUrl = updates.videoUrl;
        if (updates.tournamentFormat)
            values.tournamentFormat = updates.tournamentFormat;
        if (updates.matchPin) values.matchPin = updates.matchPin;
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
                matchCode: `OC3_M_MEM${rows.length + 1}`,
                matchPin: "000000",
                matchName: input.matchName,
                matchStatus: "setup",
                tournamentId: null,
            };
            rows.push(row);
            return row;
        },
        async update(slug, updates) {
            const row = rows.find((r) => r.matchSlug === slug);
            if (!row) return null;
            Object.assign(row, updates);
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
