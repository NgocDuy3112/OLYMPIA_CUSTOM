import { and, eq } from "@oc/db";
import { db, answers, users } from "@oc/db";

export type AnswerRow = typeof answers.$inferSelect;

export interface AnswerWithUserCode extends AnswerRow {
  userCode: string | null;
}

export interface AnswerCreateInput {
  matchId: string;
  playerId: string;
  questionId: string;
  answerText?: string | null;
  hasBuzzed?: boolean;
  timestamp?: number | string | null;
}

export interface AnswerRepo {
  findExisting(
    matchId: string,
    playerId: string,
    questionId: string,
  ): Promise<{ id: string } | null>;
  create(input: AnswerCreateInput): Promise<{ id: string }>;
  listByMatch(matchId: string): Promise<AnswerRow[]>;
  listByQuestion(
    matchId: string,
    questionId: string,
  ): Promise<AnswerWithUserCode[]>;
}

export const drizzleAnswerRepo: AnswerRepo = {
  async findExisting(matchId, playerId, questionId) {
    const rows = await db
      .select({ id: answers.id })
      .from(answers)
      .where(
        and(
          eq(answers.matchId, matchId),
          eq(answers.playerId, playerId),
          eq(answers.questionId, questionId),
          eq(answers.isDeleted, false),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  },

  async create(input) {
    const result = await db
      .insert(answers)
      .values({
        matchId: input.matchId,
        playerId: input.playerId,
        questionId: input.questionId,
        answerText: input.answerText ?? null,
        hasBuzzed: input.hasBuzzed ?? false,
        timestamp:
          input.timestamp == null ? null : String(input.timestamp),
      })
      .returning({ id: answers.id });
    return result[0];
  },

  async listByMatch(matchId) {
    const rows = await db
      .select()
      .from(answers)
      .where(and(eq(answers.matchId, matchId), eq(answers.isDeleted, false)));
    return rows;
  },

  async listByQuestion(matchId, questionId) {
    const rows = await db
      .select({ answer: answers, userCode: users.userCode })
      .from(answers)
      .leftJoin(users, eq(answers.playerId, users.id))
      .where(
        and(
          eq(answers.matchId, matchId),
          eq(answers.questionId, questionId),
          eq(answers.isDeleted, false),
        ),
      );
    return rows.map((r) => ({ ...r.answer, userCode: r.userCode }));
  },
};

export function createInMemoryAnswerRepo(
  seed: AnswerRow[] = [],
): AnswerRepo & { rows: AnswerRow[] } {
  const rows = [...seed];
  return {
    rows,
    async findExisting(matchId, playerId, questionId) {
      const found = rows.find(
        (r) =>
          r.matchId === matchId &&
          r.playerId === playerId &&
          r.questionId === questionId &&
          !r.isDeleted,
      );
      return found ? { id: found.id } : null;
    },
    async create(input) {
      const row = {
        id: `mem-${rows.length + 1}`,
        matchId: input.matchId,
        playerId: input.playerId,
        questionId: input.questionId,
        answerText: input.answerText ?? null,
        hasBuzzed: input.hasBuzzed ?? false,
        timestamp: input.timestamp == null ? null : String(input.timestamp),
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AnswerRow;
      rows.push(row);
      return { id: row.id };
    },
    async listByMatch(matchId) {
      return rows.filter((r) => r.matchId === matchId && !r.isDeleted);
    },
    async listByQuestion(matchId, questionId) {
      return rows
        .filter(
          (r) =>
            r.matchId === matchId &&
            r.questionId === questionId &&
            !r.isDeleted,
        )
        .map((r) => ({ ...r, userCode: null }));
    },
  };
}
