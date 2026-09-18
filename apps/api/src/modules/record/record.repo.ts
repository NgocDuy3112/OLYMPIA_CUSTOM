import { and, eq } from "drizzle-orm";
import { db, records } from "@oc/db";

export type RecordRow = typeof records.$inferSelect;

export interface RecordInsertInput {
  points: number;
  playerId: string;
  matchId: string;
  questionId: string;
  questionCode?: string | null;
  roundNumber?: number | null;
}

export interface RecordRepo {
  listByMatch(matchId: string, questionCode?: string): Promise<RecordRow[]>;
  insertRows(rows: RecordInsertInput[]): Promise<void>;
}

export const drizzleRecordRepo: RecordRepo = {
  async listByMatch(matchId, questionCode?) {
    const conditions = [
      eq(records.matchId, matchId),
      eq(records.isDeleted, false),
    ];
    if (questionCode) conditions.push(eq(records.questionCode, questionCode));
    const rows = await db
      .select()
      .from(records)
      .where(and(...conditions));
    return rows;
  },

  async insertRows(rows) {
    if (rows.length === 0) return;
    await db.insert(records).values(
      rows.map((r) => ({
        points: r.points,
        playerId: r.playerId,
        matchId: r.matchId,
        questionId: r.questionId,
        questionCode: r.questionCode ?? null,
        roundNumber: r.roundNumber ?? null,
      })),
    );
  },
};

export function createInMemoryRecordRepo(
  seed: RecordRow[] = [],
): RecordRepo & { rows: RecordRow[] } {
  const rows = [...seed];
  return {
    rows,
    async listByMatch(matchId, questionCode?) {
      return rows.filter(
        (r) =>
          r.matchId === matchId &&
          !r.isDeleted &&
          (!questionCode || r.questionCode === questionCode),
      );
    },
    async insertRows(inputs) {
      for (const input of inputs) {
        const row = {
          id: `mem-${rows.length + 1}`,
          points: input.points,
          playerId: input.playerId,
          matchId: input.matchId,
          questionId: input.questionId,
          questionCode: input.questionCode ?? null,
          roundNumber: input.roundNumber ?? null,
          isDeleted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as RecordRow;
        rows.push(row);
      }
    },
  };
}
