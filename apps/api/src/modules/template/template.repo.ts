import { and, eq } from "drizzle-orm";
import {
  db,
  matches,
  tournaments,
  tournamentPhases,
  bracketEdges,
} from "@oc/db";

export interface TemplateTournamentRow {
  id: string;
}

export interface TemplatePhaseRow {
  id: string;
  tournamentId: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
  matchCount: number;
}

export interface TemplateMatchRow {
  id: string;
  matchCode: string;
  matchSlug: string;
  matchPin: string;
  matchName: string;
  matchLabel: string | null;
  matchFormat: string;
  tournamentId: string | null;
  phaseId: string | null;
}

export interface InsertPhaseInput {
  tournamentId: string;
  phaseNumber: number;
  phaseName: string;
  phaseType: string;
  matchCount: number;
}

export interface InsertMatchInput {
  tournamentId: string;
  phaseId?: string;
  matchCode: string;
  matchPin: string;
  matchName: string;
  matchLabel: string;
  matchFormat: string;
  scheduledAt?: Date;
  venue?: string;
  createdBy?: string;
}

export interface TemplateRepo {
  findTournamentByCode(code: string): Promise<TemplateTournamentRow | null>;
  listPhases(tournamentId: string): Promise<TemplatePhaseRow[]>;
  listPhasesByTournament(tournamentId: string): Promise<TemplatePhaseRow[]>;
  insertPhase(input: InsertPhaseInput): Promise<TemplatePhaseRow>;
  updatePhaseMatchCount(phaseId: string, matchCount: number): Promise<void>;
  insertMatch(input: InsertMatchInput): Promise<TemplateMatchRow>;
  listMatchesByTournament(
    tournamentId: string,
  ): Promise<Array<{ id: string; matchCode: string; matchLabel: string | null }>>;
  findMatchById(id: string): Promise<TemplateMatchRow | null>;
  findMatchByCode(matchCode: string): Promise<TemplateMatchRow | null>;
  insertBracketEdge(input: {
    fromMatchId: string;
    rank: number;
    toMatchId: string;
  }): Promise<void>;
  updateTournamentFormat(tournamentId: string, format: string): Promise<void>;
}

export const drizzleTemplateRepo: TemplateRepo = {
  async findTournamentByCode(code: string): Promise<TemplateTournamentRow | null> {
    const rows = await db
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(
        and(
          eq(tournaments.tournamentCode, code),
          eq(tournaments.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async listPhases(tournamentId: string): Promise<TemplatePhaseRow[]> {
    const rows = await db
      .select({
        id: tournamentPhases.id,
        tournamentId: tournamentPhases.tournamentId,
        phaseNumber: tournamentPhases.phaseNumber,
        phaseName: tournamentPhases.phaseName,
        phaseType: tournamentPhases.phaseType,
        matchCount: tournamentPhases.matchCount,
      })
      .from(tournamentPhases)
      .where(eq(tournamentPhases.tournamentId, tournamentId));
    return rows.map((r) => ({
      id: r.id,
      tournamentId: r.tournamentId,
      phaseNumber: r.phaseNumber,
      phaseName: r.phaseName,
      phaseType: r.phaseType ?? "group_stage",
      matchCount: r.matchCount ?? 0,
    }));
  },

  async listPhasesByTournament(
    tournamentId: string,
  ): Promise<TemplatePhaseRow[]> {
    return drizzleTemplateRepo.listPhases(tournamentId);
  },

  async insertPhase(input: InsertPhaseInput): Promise<TemplatePhaseRow> {
    const rows = await db
      .insert(tournamentPhases)
      .values({
        tournamentId: input.tournamentId,
        phaseNumber: input.phaseNumber,
        phaseName: input.phaseName,
        phaseType: input.phaseType,
        matchCount: input.matchCount,
      })
      .returning();
    const r = rows[0];
    return {
      id: r.id,
      tournamentId: r.tournamentId,
      phaseNumber: r.phaseNumber,
      phaseName: r.phaseName,
      phaseType: r.phaseType ?? input.phaseType,
      matchCount: r.matchCount ?? input.matchCount,
    };
  },

  async updatePhaseMatchCount(
    phaseId: string,
    matchCount: number,
  ): Promise<void> {
    await db
      .update(tournamentPhases)
      .set({ matchCount })
      .where(eq(tournamentPhases.id, phaseId));
  },

  async insertMatch(input: InsertMatchInput): Promise<TemplateMatchRow> {
    const rows = await db
      .insert(matches)
      .values({
        matchCode: input.matchCode,
        matchPin: input.matchPin,
        matchName: input.matchName,
        matchLabel: input.matchLabel,
        matchFormat: input.matchFormat,
        phaseId: input.phaseId,
        scheduledAt: input.scheduledAt,
        venue: input.venue,
        tournamentId: input.tournamentId,
        createdBy: input.createdBy,
      })
      .returning();
    const r = rows[0];
    return {
      id: r.id,
      matchCode: r.matchCode,
      matchSlug: r.matchSlug,
      matchPin: r.matchPin,
      matchName: r.matchName,
      matchLabel: r.matchLabel,
      matchFormat: r.matchFormat,
      tournamentId: r.tournamentId,
      phaseId: r.phaseId,
    };
  },

  async listMatchesByTournament(
    tournamentId: string,
  ): Promise<Array<{ id: string; matchCode: string; matchLabel: string | null }>> {
    const rows = await db
      .select({
        id: matches.id,
        matchCode: matches.matchCode,
        matchLabel: matches.matchLabel,
      })
      .from(matches)
      .where(
        and(
          eq(matches.tournamentId, tournamentId),
          eq(matches.isDeleted, false),
        ),
      );
    return rows;
  },

  async findMatchById(id: string): Promise<TemplateMatchRow | null> {
    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.id, id))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      matchCode: r.matchCode,
      matchSlug: r.matchSlug,
      matchPin: r.matchPin,
      matchName: r.matchName,
      matchLabel: r.matchLabel,
      matchFormat: r.matchFormat,
      tournamentId: r.tournamentId,
      phaseId: r.phaseId,
    };
  },

  async findMatchByCode(matchCode: string): Promise<TemplateMatchRow | null> {
    const rows = await db
      .select()
      .from(matches)
      .where(eq(matches.matchCode, matchCode))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      matchCode: r.matchCode,
      matchSlug: r.matchSlug,
      matchPin: r.matchPin,
      matchName: r.matchName,
      matchLabel: r.matchLabel,
      matchFormat: r.matchFormat,
      tournamentId: r.tournamentId,
      phaseId: r.phaseId,
    };
  },

  async insertBracketEdge(input: {
    fromMatchId: string;
    rank: number;
    toMatchId: string;
  }): Promise<void> {
    await db
      .insert(bracketEdges)
      .values({
        fromMatchId: input.fromMatchId,
        rank: input.rank,
        toMatchId: input.toMatchId,
      })
      .onConflictDoNothing();
  },

  async updateTournamentFormat(
    tournamentId: string,
    format: string,
  ): Promise<void> {
    await db
      .update(tournaments)
      .set({ tournamentFormat: format, updatedAt: new Date() })
      .where(eq(tournaments.id, tournamentId));
  },
};

interface InMemoryPhase extends TemplatePhaseRow {}
interface InMemoryMatch extends TemplateMatchRow {
  isDeleted: boolean;
}

export function createInMemoryTemplateRepo(
  seed: {
    tournaments?: TemplateTournamentRow[];
    phases?: TemplatePhaseRow[];
    matches?: TemplateMatchRow[];
  } = {},
): TemplateRepo & {
  tournaments: TemplateTournamentRow[];
  phases: TemplatePhaseRow[];
  matches: TemplateMatchRow[];
} {
  const tournamentsRows: TemplateTournamentRow[] = [...(seed.tournaments ?? [])];
  const phasesRows: TemplatePhaseRow[] = [...(seed.phases ?? [])];
  const matchesRows: InMemoryMatch[] = (seed.matches ?? []).map((m) => ({
    ...m,
    isDeleted: false,
  }));
  // tournamentCode -> id lookup for findTournamentByCode in tests
  const codeToId = new Map<string, string>();
  for (const t of tournamentsRows) {
    codeToId.set(t.id, t.id);
  }

  let seq = 1;
  const nextId = (prefix: string) => `${prefix}-mem-${seq++}`;

  return {
    tournaments: tournamentsRows,
    phases: phasesRows,
    matches: matchesRows,

    async findTournamentByCode(code: string) {
      // In-memory rows carry id only; tests seed with id === code or map via extra field.
      // Match by id first, then by codeToId override.
      const byId = tournamentsRows.find((t) => t.id === code) ?? null;
      if (byId) return byId;
      const mapped = codeToId.get(code);
      if (mapped) return tournamentsRows.find((t) => t.id === mapped) ?? null;
      return null;
    },

    async listPhases(tournamentId: string) {
      return phasesRows.filter((p) => p.tournamentId === tournamentId);
    },

    async listPhasesByTournament(tournamentId: string) {
      return phasesRows.filter((p) => p.tournamentId === tournamentId);
    },

    async insertPhase(input: InsertPhaseInput) {
      const row: TemplatePhaseRow = {
        id: nextId("phase"),
        tournamentId: input.tournamentId,
        phaseNumber: input.phaseNumber,
        phaseName: input.phaseName,
        phaseType: input.phaseType,
        matchCount: input.matchCount,
      };
      phasesRows.push(row);
      return row;
    },

    async updatePhaseMatchCount(phaseId: string, matchCount: number) {
      const phase = phasesRows.find((p) => p.id === phaseId);
      if (phase) phase.matchCount = matchCount;
    },

    async insertMatch(input: InsertMatchInput) {
      const row: InMemoryMatch = {
        id: nextId("match"),
        matchCode: input.matchCode,
        matchSlug: nextId("slug"),
        matchPin: input.matchPin,
        matchName: input.matchName,
        matchLabel: input.matchLabel,
        matchFormat: input.matchFormat,
        tournamentId: input.tournamentId,
        phaseId: input.phaseId ?? null,
        isDeleted: false,
      };
      matchesRows.push(row);
      return row;
    },

    async listMatchesByTournament(tournamentId: string) {
      return matchesRows
        .filter((m) => m.tournamentId === tournamentId && !m.isDeleted)
        .map((m) => ({
          id: m.id,
          matchCode: m.matchCode,
          matchLabel: m.matchLabel,
        }));
    },

    async findMatchById(id: string) {
      return matchesRows.find((m) => m.id === id) ?? null;
    },

    async findMatchByCode(matchCode: string) {
      return matchesRows.find((m) => m.matchCode === matchCode) ?? null;
    },

    async insertBracketEdge() {
      return;
    },

    async updateTournamentFormat() {
      return;
    },
  };
}
