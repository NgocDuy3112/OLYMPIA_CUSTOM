import { desc, eq, sql } from "drizzle-orm";
import { db, matches, matchCheckpoints } from "@oc/db";

export type CheckpointRow = typeof matchCheckpoints.$inferSelect;

export interface CheckpointListItem {
  id: string;
  matchCode: string;
  createdAt: Date | null;
}

export interface CheckpointRepo {
  listByMatch(matchCode: string, limit?: number): Promise<CheckpointListItem[]>;
  latest(matchCode: string): Promise<Record<string, unknown> | null>;
  insert(matchCode: string, checkpoint: Record<string, unknown>): Promise<void>;
  deleteById(id: string): Promise<void>;
  pruneKeepLatest(matchCode: string, keep: number): Promise<void>;
  count(matchCode: string): Promise<number>;
  matchCodeExists(matchCode: string): Promise<boolean>;
}

export const drizzleCheckpointRepo: CheckpointRepo = {
  async listByMatch(matchCode, limit = 10) {
    const rows = await db
      .select({
        id: matchCheckpoints.id,
        matchCode: matchCheckpoints.matchCode,
        createdAt: matchCheckpoints.createdAt,
      })
      .from(matchCheckpoints)
      .where(eq(matchCheckpoints.matchCode, matchCode))
      .orderBy(desc(matchCheckpoints.createdAt))
      .limit(limit);
    return rows;
  },

  async latest(matchCode) {
    const rows = await db
      .select({ checkpoint: matchCheckpoints.checkpoint })
      .from(matchCheckpoints)
      .where(eq(matchCheckpoints.matchCode, matchCode))
      .orderBy(desc(matchCheckpoints.createdAt))
      .limit(1);
    if (rows.length === 0) return null;
    return rows[0].checkpoint as Record<string, unknown>;
  },

  async insert(matchCode, checkpoint) {
    await db.insert(matchCheckpoints).values({ matchCode, checkpoint });
  },

  async deleteById(id) {
    await db.delete(matchCheckpoints).where(eq(matchCheckpoints.id, id));
  },

  async pruneKeepLatest(matchCode, keep) {
    const rows = await db
      .select({ id: matchCheckpoints.id })
      .from(matchCheckpoints)
      .where(eq(matchCheckpoints.matchCode, matchCode))
      .orderBy(desc(matchCheckpoints.createdAt))
      .offset(keep);
    for (const row of rows) {
      await db.delete(matchCheckpoints).where(eq(matchCheckpoints.id, row.id));
    }
  },

  async count(matchCode) {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(matchCheckpoints)
      .where(eq(matchCheckpoints.matchCode, matchCode));
    return Number(rows[0]?.count ?? 0);
  },

  async matchCodeExists(matchCode) {
    const rows = await db
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.matchCode, matchCode))
      .limit(1);
    return rows.length > 0;
  },
};

export function createInMemoryCheckpointRepo(
  seed: CheckpointRow[] = [],
): CheckpointRepo & { rows: CheckpointRow[] } {
  const rows = [...seed];
  const sorted = (matchCode: string) =>
    rows
      .filter((r) => r.matchCode === matchCode)
      .sort(
        (a, b) =>
          (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
      );
  return {
    rows,
    async listByMatch(matchCode, limit = 10) {
      return sorted(matchCode)
        .slice(0, limit)
        .map((r) => ({
          id: r.id,
          matchCode: r.matchCode,
          createdAt: r.createdAt,
        }));
    },
    async latest(matchCode) {
      const first = sorted(matchCode)[0];
      return (first?.checkpoint as Record<string, unknown> | undefined) ?? null;
    },
    async insert(matchCode, checkpoint) {
      const row = {
        id: `mem-${rows.length + 1}`,
        matchCode,
        checkpoint,
        createdAt: new Date(),
      } as CheckpointRow;
      rows.push(row);
    },
    async deleteById(id) {
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    },
    async pruneKeepLatest(matchCode, keep) {
      const keepIds = new Set(sorted(matchCode).slice(0, keep).map((r) => r.id));
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].matchCode === matchCode && !keepIds.has(rows[i].id)) {
          rows.splice(i, 1);
        }
      }
    },
    async count(matchCode) {
      return rows.filter((r) => r.matchCode === matchCode).length;
    },
    async matchCodeExists() {
      return true;
    },
  };
}
