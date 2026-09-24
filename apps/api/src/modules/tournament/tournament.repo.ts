import { and, desc, eq, inArray, or, sql } from "@oc/db";
import {
  db,
  bracketEdges,
  matches,
  records,
  tournaments,
  tournamentPhases,
  tournamentPlayers,
  users,
} from "@oc/db";
import { makeTournamentCode, ocNumberFromFormat } from "@oc/shared";

export interface TournamentRow {
  id: string;
  tournamentCode: string;
  tournamentName: string;
  maxPlayers?: string | null;
}

export interface TournamentMatchRow {
  id: string;
  matchSlug: string;
  matchCode: string;
  matchPin: string;
  matchName: string;
  matchStatus: string;
  tournamentFormat: string;
  videoUrl: string | null;
  scheduledAt: Date | null;
  venue: string | null;
  matchLabel: string | null;
  createdAt: Date | null;
}

export interface BracketPhaseRow {
  id: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
}

export interface BracketMatchRow {
  id: string;
  matchSlug: string;
  matchCode: string;
  matchName: string;
  matchStatus: string;
  matchLabel: string | null;
  scheduledAt: Date | null;
  venue: string | null;
  phaseId: string | null;
}

export interface BracketEdgeRow {
  fromMatchId: string;
  rank: number;
  toMatchId: string;
}

export interface TournamentMemberRow {
  id: string;
  role: string;
  groupNumber: string | null;
  notes: string | null;
  userCode: string;
  userName: string;
  userId: string;
  email: string;
}

export interface TournamentRepo {
  list(): Promise<TournamentRow[]>;
  findByCode(code: string): Promise<TournamentRow | null>;
  create(input: {
    tournamentName: string;
    description?: string;
    tournamentFormat?: string;
    startDate?: string;
    endDate?: string;
    maxPlayers?: string;
    venue?: string;
    notes?: string;
    createdBy: string;
  }): Promise<TournamentRow>;
  update(
    code: string,
    updates: Record<string, unknown>,
  ): Promise<{ id: string } | null>;
  softDelete(code: string): Promise<boolean>;
  listMembers(tournamentId: string): Promise<TournamentMemberRow[]>;
  listMatches(tournamentId: string): Promise<TournamentMatchRow[]>;
  findMember(
    tournamentId: string,
    playerId: string,
  ): Promise<{ id: string; role: string; groupNumber?: string | null } | null>;
  addMember(input: {
    tournamentId: string;
    playerId: string;
    role: string;
    groupNumber?: string;
    notes?: string;
  }): Promise<void>;
  removeMember(tournamentId: string, playerId: string): Promise<void>;
  updateMemberRole(memberId: string, role: string): Promise<void>;
  findUserByCode(userCode: string): Promise<{ id: string } | null>;
  countMembers(tournamentId: string): Promise<number>;
  listMyTournaments(playerId: string): Promise<
    Array<{
      tournamentCode: string;
      tournamentName: string;
      tournamentFormat: string;
      status: string;
      role: string;
      groupNumber: string | null;
    }>
  >;
  standings(tournamentId: string): Promise<
    Array<{
      playerId: string;
      userName: string;
      userCode: string;
      groupNumber: string | null;
      totalPoints: number;
      matchesPlayed: number;
      totalMatches: number;
      rank: number;
    }>
  >;
  bracket(tournamentId: string): Promise<{
    phases: BracketPhaseRow[];
    matches: BracketMatchRow[];
    edges: BracketEdgeRow[];
  }>;
}

export const drizzleTournamentRepo: TournamentRepo = {
  async list(): Promise<TournamentRow[]> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.isDeleted, false))
      .orderBy(desc(tournaments.createdAt));
    return rows as TournamentRow[];
  },

  async findByCode(code: string): Promise<TournamentRow | null> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(
        and(
          eq(tournaments.tournamentCode, code),
          eq(tournaments.isDeleted, false),
        ),
      )
      .limit(1);
    return (rows[0] as TournamentRow | undefined) ?? null;
  },

  async create(input: {
    tournamentName: string;
    description?: string;
    tournamentFormat?: string;
    startDate?: string;
    endDate?: string;
    maxPlayers?: string;
    venue?: string;
    notes?: string;
    createdBy: string;
  }): Promise<TournamentRow> {
    const ocNumber = ocNumberFromFormat(input.tournamentFormat);
    const tournamentCode = makeTournamentCode(
      ocNumber,
      Date.now().toString(36).toUpperCase(),
    );
    const result = await db
      .insert(tournaments)
      .values({
        tournamentCode,
        tournamentName: input.tournamentName,
        description: input.description,
        tournamentFormat: input.tournamentFormat || "oc3",
        startDate: input.startDate,
        endDate: input.endDate,
        maxPlayers: input.maxPlayers,
        venue: input.venue,
        notes: input.notes,
        createdBy: input.createdBy,
      })
      .returning();
    return result[0] as TournamentRow;
  },

  async update(
    code: string,
    updates: Record<string, unknown>,
  ): Promise<{ id: string } | null> {
    const result = await db
      .update(tournaments)
      .set({ ...updates, updatedAt: new Date() })
      .where(
        and(
          eq(tournaments.tournamentCode, code),
          eq(tournaments.isDeleted, false),
        ),
      )
      .returning({ id: tournaments.id });
    return result[0] ?? null;
  },

  async softDelete(code: string): Promise<boolean> {
    const result = await db
      .update(tournaments)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(
        and(
          eq(tournaments.tournamentCode, code),
          eq(tournaments.isDeleted, false),
        ),
      )
      .returning({ id: tournaments.id });
    return result.length > 0;
  },

  async listMembers(tournamentId: string): Promise<TournamentMemberRow[]> {
    const rows = await db
      .select({
        id: tournamentPlayers.id,
        role: tournamentPlayers.role,
        groupNumber: tournamentPlayers.groupNumber,
        notes: tournamentPlayers.notes,
        userCode: users.userCode,
        userName: users.userName,
        userId: users.id,
        email: users.email,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    return rows;
  },

  async listMatches(tournamentId: string): Promise<TournamentMatchRow[]> {
    const rows = await db
      .select({
        id: matches.id,
        matchSlug: matches.matchSlug,
        matchCode: matches.matchCode,
        matchPin: matches.matchPin,
        matchName: matches.matchName,
        matchStatus: matches.matchStatus,
        tournamentFormat: matches.tournamentFormat,
        videoUrl: matches.videoUrl,
        scheduledAt: matches.scheduledAt,
        venue: matches.venue,
        matchLabel: matches.matchLabel,
        createdAt: matches.createdAt,
      })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.isDeleted, false),
        ),
      )
      .orderBy(desc(matches.createdAt));
    return rows;
  },

  async bracket(tournamentId: string): Promise<{
    phases: BracketPhaseRow[];
    matches: BracketMatchRow[];
    edges: BracketEdgeRow[];
  }> {
    const phases = await db
      .select({
        id: tournamentPhases.id,
        phaseNumber: tournamentPhases.phaseNumber,
        phaseName: tournamentPhases.phaseName,
        phaseType: tournamentPhases.phaseType,
      })
      .from(tournamentPhases)
      .where(eq(tournamentPhases.tournamentId, tournamentId))
      .orderBy(tournamentPhases.phaseNumber);
    const bmatches = await db
      .select({
        id: matches.id,
        matchSlug: matches.matchSlug,
        matchCode: matches.matchCode,
        matchName: matches.matchName,
        matchStatus: matches.matchStatus,
        matchLabel: matches.matchLabel,
        scheduledAt: matches.scheduledAt,
        venue: matches.venue,
        phaseId: matches.phaseId,
      })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.isDeleted, false),
        ),
      );
    const ids = bmatches.map((m) => m.id);
    const edges =
      ids.length === 0
        ? []
        : await db
            .select({
              fromMatchId: bracketEdges.fromMatchId,
              rank: bracketEdges.rank,
              toMatchId: bracketEdges.toMatchId,
            })
            .from(bracketEdges)
            .where(
              or(
                inArray(bracketEdges.fromMatchId, ids),
                inArray(bracketEdges.toMatchId, ids),
              ),
            );
    return {
      phases: phases.map((p) => ({
        id: p.id,
        phaseNumber: p.phaseNumber,
        phaseName: p.phaseName,
        phaseType: p.phaseType ?? "group_stage",
      })),
      matches: bmatches,
      edges,
    };
  },

  async findMember(
    tournamentId: string,
    playerId: string,
  ): Promise<{ id: string; role: string; groupNumber?: string | null } | null> {
    const rows = await db
      .select({
        id: tournamentPlayers.id,
        role: tournamentPlayers.role,
        groupNumber: tournamentPlayers.groupNumber,
      })
      .from(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.playerId, playerId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async addMember(input: {
    tournamentId: string;
    playerId: string;
    role: string;
    groupNumber?: string;
    notes?: string;
  }): Promise<void> {
    await db.insert(tournamentPlayers).values({
      tournamentId: input.tournamentId,
      playerId: input.playerId,
      role: input.role,
      groupNumber: input.groupNumber,
      notes: input.notes,
    });
  },

  async removeMember(tournamentId: string, playerId: string): Promise<void> {
    await db
      .delete(tournamentPlayers)
      .where(
        and(
          eq(tournamentPlayers.tournamentId, tournamentId),
          eq(tournamentPlayers.playerId, playerId),
        ),
      );
  },

  async updateMemberRole(memberId: string, role: string): Promise<void> {
    await db
      .update(tournamentPlayers)
      .set({ role })
      .where(eq(tournamentPlayers.id, memberId));
  },

  async findUserByCode(userCode: string): Promise<{ id: string } | null> {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.userCode, userCode), eq(users.isDeleted, false)))
      .limit(1);
    return rows[0] ?? null;
  },

  async countMembers(tournamentId: string): Promise<number> {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    return Number(rows[0]?.count ?? 0);
  },

  async listMyTournaments(playerId: string) {
    const rows = await db
      .select({
        tournamentCode: tournaments.tournamentCode,
        tournamentName: tournaments.tournamentName,
        tournamentFormat: tournaments.tournamentFormat,
        status: tournaments.status,
        role: tournamentPlayers.role,
        groupNumber: tournamentPlayers.groupNumber,
      })
      .from(tournamentPlayers)
      .innerJoin(
        tournaments,
        eq(tournamentPlayers.tournamentId, tournaments.id),
      )
      .where(
        and(
          eq(tournamentPlayers.playerId, playerId),
          eq(tournaments.isDeleted, false),
        ),
      )
      .orderBy(desc(tournaments.createdAt));
    return rows;
  },

  async standings(tournamentId: string) {
    const matchRows = await db
      .select({ id: matches.id })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.isDeleted, false),
        ),
      );
    const matchIds = matchRows.map((m) => m.id);
    const playerRows = await db
      .select({
        playerId: tournamentPlayers.playerId,
        groupNumber: tournamentPlayers.groupNumber,
        userName: users.userName,
        userCode: users.userCode,
      })
      .from(tournamentPlayers)
      .innerJoin(users, eq(tournamentPlayers.playerId, users.id))
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    if (matchIds.length === 0) {
      return playerRows.map((p, index) => ({
        ...p,
        totalPoints: 0,
        matchesPlayed: 0,
        totalMatches: 0,
        rank: index + 1,
      }));
    }
    const allRecords = await db
      .select({
        playerId: records.playerId,
        matchId: records.matchId,
        points: records.points,
      })
      .from(records)
      .innerJoin(matches, eq(records.matchId, matches.id))
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(records.isDeleted, false),
          eq(matches.isDeleted, false),
        ),
      );
    const scoreMap = new Map<string, { totalPoints: number; matches: Set<string> }>();
    for (const row of allRecords) {
      const entry = scoreMap.get(row.playerId) ?? {
        totalPoints: 0,
        matches: new Set<string>(),
      };
      entry.totalPoints += row.points;
      entry.matches.add(row.matchId);
      scoreMap.set(row.playerId, entry);
    }
    return playerRows
      .map((p) => {
        const entry = scoreMap.get(p.playerId);
        return {
          ...p,
          totalPoints: entry?.totalPoints ?? 0,
          matchesPlayed: entry?.matches.size ?? 0,
          totalMatches: matchIds.length,
        };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((p, index) => ({ ...p, rank: index + 1 }));
  },
};

export function createInMemoryTournamentRepo(
  seed: TournamentRow[] = [],
): TournamentRepo & { rows: TournamentRow[] } {
  const rows = [...seed];
  const members = new Map<string, TournamentMemberRow[]>();
  return {
    rows,
    async list() {
      return [...rows];
    },
    async findByCode(code) {
      return rows.find((r) => r.tournamentCode === code) ?? null;
    },
    async create(input) {
      const row: TournamentRow = {
        id: `mem-${rows.length + 1}`,
        tournamentCode: makeTournamentCode(
          ocNumberFromFormat(input.tournamentFormat),
          `MEM${rows.length + 1}`,
        ),
        tournamentName: input.tournamentName,
      };
      rows.push(row);
      return row;
    },
    async update(code) {
      const row = rows.find((r) => r.tournamentCode === code);
      return row ? { id: row.id } : null;
    },
    async softDelete(code) {
      const idx = rows.findIndex((r) => r.tournamentCode === code);
      if (idx < 0) return false;
      rows.splice(idx, 1);
      return true;
    },
    async listMembers(tournamentId) {
      return members.get(tournamentId) ?? [];
    },
    async listMatches() {
      return [];
    },
    async findMember(tournamentId, playerId) {
      const list = members.get(tournamentId) ?? [];
      const found = list.find((m) => m.userId === playerId);
      return found ? { id: found.id, role: found.role } : null;
    },
    async addMember(input) {
      const list = members.get(input.tournamentId) ?? [];
      list.push({
        id: `mem-${list.length + 1}`,
        role: input.role,
        groupNumber: input.groupNumber ?? null,
        notes: input.notes ?? null,
        userCode: input.playerId,
        userName: input.playerId,
        userId: input.playerId,
        email: "",
      });
      members.set(input.tournamentId, list);
    },
    async removeMember(tournamentId, playerId) {
      const list = members.get(tournamentId) ?? [];
      members.set(
        tournamentId,
        list.filter((m) => m.userId !== playerId),
      );
    },
    async updateMemberRole(memberId, role) {
      for (const list of members.values()) {
        const found = list.find((m) => m.id === memberId);
        if (found) found.role = role;
      }
    },
    async findUserByCode(userCode) {
      return { id: userCode };
    },
    async countMembers(tournamentId) {
      return (members.get(tournamentId) ?? []).length;
    },
    async listMyTournaments() {
      return [];
    },
    async standings() {
      return [];
    },
    async bracket() {
      return { phases: [], matches: [], edges: [] };
    },
  };
}
