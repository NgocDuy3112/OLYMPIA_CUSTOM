import { and, eq } from "@oc/db";
import { db, questionSets, questionSetItems } from "@oc/db";

export interface QuestionSetRow {
  id: string;
  setCode: string;
  setName: string;
  matchCode: string | null;
  status: string;
  activeMatchCode: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface QuestionSetItemRow {
  id: string;
  setId: string;
  round: string;
  slot: string;
  bankCode: string;
}

export interface QuestionSetRepo {
  list(matchCode?: string): Promise<QuestionSetRow[]>;
  findByCode(setCode: string): Promise<QuestionSetRow | null>;
  create(input: { setCode: string; setName: string; matchCode?: string | null }): Promise<QuestionSetRow>;
  update(
    id: string,
    updates: { setName?: string; matchCode?: string | null; status?: string; activeMatchCode?: string | null },
  ): Promise<QuestionSetRow | null>;
  remove(id: string): Promise<boolean>;
  listItems(setId: string): Promise<QuestionSetItemRow[]>;
  upsertItem(setId: string, input: { round: string; slot: string; bankCode: string }): Promise<QuestionSetItemRow>;
  removeItem(setId: string, slot: string): Promise<boolean>;
  clearActiveForMatch(matchCode: string, exceptSetId: string): Promise<void>;
}

const toRow = (r: typeof questionSets.$inferSelect): QuestionSetRow => ({
  id: r.id,
  setCode: r.setCode,
  setName: r.setName,
  matchCode: r.matchCode,
  status: r.status,
  activeMatchCode: r.activeMatchCode,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const drizzleQuestionSetRepo: QuestionSetRepo = {
  async list(matchCode) {
    const rows = await db
      .select()
      .from(questionSets)
      .where(matchCode ? eq(questionSets.matchCode, matchCode) : undefined)
      .orderBy(questionSets.createdAt);
    return rows.map(toRow);
  },

  async findByCode(setCode) {
    const rows = await db
      .select()
      .from(questionSets)
      .where(eq(questionSets.setCode, setCode))
      .limit(1);
    return rows[0] ? toRow(rows[0]) : null;
  },

  async create(input) {
    const rows = await db
      .insert(questionSets)
      .values({
        setCode: input.setCode,
        setName: input.setName,
        matchCode: input.matchCode ?? null,
      })
      .returning();
    return toRow(rows[0]);
  },

  async update(id, updates) {
    const rows = await db
      .update(questionSets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(questionSets.id, id))
      .returning();
    return rows[0] ? toRow(rows[0]) : null;
  },

  async remove(id) {
    const rows = await db
      .delete(questionSets)
      .where(eq(questionSets.id, id))
      .returning({ id: questionSets.id });
    return rows.length > 0;
  },

  async listItems(setId) {
    const rows = await db
      .select()
      .from(questionSetItems)
      .where(eq(questionSetItems.setId, setId));
    return rows.map((r) => ({
      id: r.id,
      setId: r.setId,
      round: r.round,
      slot: r.slot,
      bankCode: r.bankCode,
    }));
  },

  async upsertItem(setId, input) {
    const existing = await db
      .select()
      .from(questionSetItems)
      .where(and(eq(questionSetItems.setId, setId), eq(questionSetItems.slot, input.slot)))
      .limit(1);
    if (existing[0]) {
      const rows = await db
        .update(questionSetItems)
        .set({ round: input.round, bankCode: input.bankCode })
        .where(eq(questionSetItems.id, existing[0].id))
        .returning();
      const r = rows[0];
      return { id: r.id, setId: r.setId, round: r.round, slot: r.slot, bankCode: r.bankCode };
    }
    const rows = await db
      .insert(questionSetItems)
      .values({ setId, round: input.round, slot: input.slot, bankCode: input.bankCode })
      .returning();
    const r = rows[0];
    return { id: r.id, setId: r.setId, round: r.round, slot: r.slot, bankCode: r.bankCode };
  },

  async removeItem(setId, slot) {
    const rows = await db
      .delete(questionSetItems)
      .where(and(eq(questionSetItems.setId, setId), eq(questionSetItems.slot, slot)))
      .returning({ id: questionSetItems.id });
    return rows.length > 0;
  },

  async clearActiveForMatch(matchCode, exceptSetId) {
    const rows = await db
      .select({ id: questionSets.id })
      .from(questionSets)
      .where(and(eq(questionSets.matchCode, matchCode), eq(questionSets.activeMatchCode, matchCode)));
    for (const r of rows) {
      if (r.id === exceptSetId) continue;
      await db
        .update(questionSets)
        .set({ activeMatchCode: null, updatedAt: new Date() })
        .where(eq(questionSets.id, r.id));
    }
  },
};
