import { and, eq, sql } from "@oc/db";
import {
  db,
  qualifierAttempts,
  qualifierQuestions,
  tournamentPlayers,
  tournaments,
  users,
} from "@oc/db";
import {
  rankQualifierPlayers,
  round3,
  scoreQualifierQuestion,
  summarizeQualifierPlayers,
  type QualifierPlayerStat,
} from "@oc/engine";

export interface QualifierQuestionRow {
  id: string;
  tournamentId: string;
  questionCode: string;
  content: string;
  options: string[];
  correctOption: string;
  explanation: string | null;
  mediaUrl: string | null;
  roundNumber: number;
  position: number;
  status: string;
}

export interface QualifierAttemptRow {
  id: string;
  qualifierQuestionId: string;
  playerId: string;
  selectedOption: string;
  isCorrect: boolean;
  responseTimeMs: number;
  points: number | null;
}

export interface QualifierStandingRow {
  playerId: string;
  userCode: string;
  userName: string;
  totalPoints: number;
  correctCount: number;
  avgCorrectTimeSec: number;
  rank: number;
}

export interface QualifierRepo {
  findTournamentByCode(code: string): Promise<{ id: string } | null>;
  countMembers(tournamentId: string): Promise<number>;
  listQuestions(tournamentId: string): Promise<QualifierQuestionRow[]>;
  findQuestion(
    tournamentId: string,
    questionCode: string,
  ): Promise<QualifierQuestionRow | null>;
  createQuestion(input: {
    tournamentId: string;
    questionCode: string;
    content: string;
    options: string[];
    correctOption: string;
    explanation?: string | null;
    mediaUrl?: string | null;
    position?: number;
  }): Promise<{ id: string }>;
  updateQuestion(
    id: string,
    updates: {
      content?: string;
      options?: string[];
      correctOption?: string;
      explanation?: string | null;
      mediaUrl?: string | null;
      position?: number;
    },
  ): Promise<boolean>;
  softDeleteQuestion(id: string): Promise<boolean>;
  listAttempts(questionId: string): Promise<QualifierAttemptRow[]>;
  submitAttempt(input: {
    questionId: string;
    playerId: string;
    selectedOption: string;
    responseTimeMs: number;
  }): Promise<{ isCorrect: boolean }>;
  closeAndScore(
    questionId: string,
    totalPlayers: number,
  ): Promise<{
    correctCount: number;
    wrongCount: number;
    noAnswerCount: number;
    perCorrect: number;
    perWrong: number;
  }>;
  standings(tournamentId: string, limit?: number): Promise<QualifierStandingRow[]>;
}

function toQuestionRow(r: Record<string, unknown>): QualifierQuestionRow {
  const rawOptions = r.options as unknown;
  return {
    id: String(r.id),
    tournamentId: String(r.tournamentId),
    questionCode: String(r.questionCode),
    content: String(r.content),
    options: Array.isArray(rawOptions) ? (rawOptions as string[]) : [],
    correctOption: String(r.correctOption),
    explanation: (r.explanation as string | null) ?? null,
    mediaUrl: (r.mediaUrl as string | null) ?? null,
    roundNumber: Number(r.roundNumber ?? 1),
    position: Number(r.position ?? 0),
    status: String(r.status ?? "open"),
  };
}

export const drizzleQualifierRepo: QualifierRepo = {
  async findTournamentByCode(code: string) {
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

  async countMembers(tournamentId: string) {
    const rows = await db
      .select({ count: sql<number>`count(*)` })
      .from(tournamentPlayers)
      .where(eq(tournamentPlayers.tournamentId, tournamentId));
    return Number(rows[0]?.count ?? 0);
  },

  async listQuestions(tournamentId: string) {
    const rows = await db
      .select()
      .from(qualifierQuestions)
      .where(
        and(
          eq(qualifierQuestions.tournamentId, tournamentId),
          eq(qualifierQuestions.isDeleted, false),
        ),
      )
      .orderBy(qualifierQuestions.position);
    return rows.map((r) => toQuestionRow(r as Record<string, unknown>));
  },

  async findQuestion(tournamentId: string, questionCode: string) {
    const rows = await db
      .select()
      .from(qualifierQuestions)
      .where(
        and(
          eq(qualifierQuestions.tournamentId, tournamentId),
          eq(qualifierQuestions.questionCode, questionCode),
          eq(qualifierQuestions.isDeleted, false),
        ),
      )
      .limit(1);
    const row = rows[0] as Record<string, unknown> | undefined;
    return row ? toQuestionRow(row) : null;
  },

  async createQuestion(input) {
    const result = await db
      .insert(qualifierQuestions)
      .values({
        tournamentId: input.tournamentId,
        questionCode: input.questionCode,
        content: input.content,
        options: input.options as unknown as typeof qualifierQuestions.$inferInsert.options,
        correctOption: input.correctOption,
        explanation: input.explanation ?? null,
        mediaUrl: input.mediaUrl ?? null,
        position: input.position ?? 0,
      })
      .returning({ id: qualifierQuestions.id });
    return result[0];
  },

  async updateQuestion(id, updates) {
    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.content !== undefined) values.content = updates.content;
    if (updates.options !== undefined) values.options = updates.options;
    if (updates.correctOption !== undefined)
      values.correctOption = updates.correctOption;
    if (updates.explanation !== undefined)
      values.explanation = updates.explanation;
    if (updates.mediaUrl !== undefined) values.mediaUrl = updates.mediaUrl;
    if (updates.position !== undefined) values.position = updates.position;
    const result = await db
      .update(qualifierQuestions)
      .set(values)
      .where(
        and(
          eq(qualifierQuestions.id, id),
          eq(qualifierQuestions.isDeleted, false),
          eq(qualifierQuestions.status, "open"),
        ),
      )
      .returning({ id: qualifierQuestions.id });
    return result.length > 0;
  },

  async softDeleteQuestion(id: string) {
    const result = await db
      .update(qualifierQuestions)
      .set({ isDeleted: true, updatedAt: new Date() })
      .where(
        and(
          eq(qualifierQuestions.id, id),
          eq(qualifierQuestions.isDeleted, false),
        ),
      )
      .returning({ id: qualifierQuestions.id });
    return result.length > 0;
  },

  async listAttempts(questionId: string) {
    const rows = await db
      .select()
      .from(qualifierAttempts)
      .where(eq(qualifierAttempts.qualifierQuestionId, questionId));
    return rows as QualifierAttemptRow[];
  },

  async submitAttempt(input) {
    const qRows = await db
      .select({
        correctOption: qualifierQuestions.correctOption,
        status: qualifierQuestions.status,
      })
      .from(qualifierQuestions)
      .where(eq(qualifierQuestions.id, input.questionId))
      .limit(1);
    const q = qRows[0];
    if (!q) throw new Error("Question not found");
    if (q.status !== "open") throw new Error("Question closed");
    const isCorrect = input.selectedOption === q.correctOption;
    await db
      .insert(qualifierAttempts)
      .values({
        qualifierQuestionId: input.questionId,
        playerId: input.playerId,
        selectedOption: input.selectedOption,
        isCorrect,
        responseTimeMs: input.responseTimeMs,
      })
      .onConflictDoNothing({
        target: [
          qualifierAttempts.qualifierQuestionId,
          qualifierAttempts.playerId,
        ],
      });
    return { isCorrect };
  },

  async closeAndScore(questionId: string, totalPlayers: number) {
    const attempts = await this.listAttempts(questionId);
    const result = scoreQualifierQuestion(
      attempts.map((a) => ({
        playerId: a.playerId,
        isCorrect: a.isCorrect,
        responseTimeMs: a.responseTimeMs,
      })),
      totalPlayers,
    );
    // Freeze + write points per attempt.
    for (const a of attempts) {
      const pts = result.points[a.playerId] ?? 0;
      await db
        .update(qualifierAttempts)
        .set({ points: pts })
        .where(eq(qualifierAttempts.id, a.id));
    }
    await db
      .update(qualifierQuestions)
      .set({ status: "closed", updatedAt: new Date() })
      .where(eq(qualifierQuestions.id, questionId));
    return {
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      noAnswerCount: result.noAnswerCount,
      perCorrect: result.perCorrect,
      perWrong: result.perWrong,
    };
  },

  async standings(tournamentId: string, limit = 16) {
    // All scored attempts (points NOT NULL) joined to questions of tournament.
    const rows = await db
      .select({
        playerId: qualifierAttempts.playerId,
        userCode: users.userCode,
        userName: users.userName,
        points: qualifierAttempts.points,
        isCorrect: qualifierAttempts.isCorrect,
        responseTimeMs: qualifierAttempts.responseTimeMs,
      })
      .from(qualifierAttempts)
      .innerJoin(
        qualifierQuestions,
        eq(qualifierAttempts.qualifierQuestionId, qualifierQuestions.id),
      )
      .innerJoin(users, eq(qualifierAttempts.playerId, users.id))
      .where(
        and(
          eq(qualifierQuestions.tournamentId, tournamentId),
          eq(qualifierQuestions.isDeleted, false),
        ),
      );
    const perPlayer: Record<
      string,
      {
        userCode: string;
        userName: string;
        rows: Array<{ points: number; isCorrect: boolean; responseTimeMs: number }>;
      }
    > = {};
    for (const r of rows) {
      if (r.points === null) continue; // not scored yet
      const entry = perPlayer[r.playerId] ?? {
        userCode: r.userCode,
        userName: r.userName,
        rows: [],
      };
      entry.rows.push({
        points: r.points,
        isCorrect: r.isCorrect,
        responseTimeMs: r.responseTimeMs,
      });
      perPlayer[r.playerId] = entry;
    }
    const stats = Object.entries(perPlayer).map(([playerId, e]) => {
      let total = 0;
      let correct = 0;
      const times: number[] = [];
      for (const row of e.rows) {
        total += row.points;
        if (row.isCorrect) {
          correct++;
          times.push(row.responseTimeMs);
        }
      }
      return {
        playerId,
        userCode: e.userCode,
        userName: e.userName,
        totalPoints: total,
        correctCount: correct,
        avgCorrectTimeSec:
          times.length === 0
            ? Infinity
            : round3(times.reduce((a, b) => a + b, 0) / times.length / 1000),
      };
    });
    const ranked = rankQualifierPlayers(
      stats.map((s) => ({
        playerId: s.playerId,
        totalPoints: s.totalPoints,
        correctCount: s.correctCount,
        avgCorrectTimeSec: s.avgCorrectTimeSec,
      })),
      limit,
    );
    const byId = new Map(stats.map((s: QualifierPlayerStat & { userCode: string; userName: string }) => [s.playerId, s]));
    return ranked.map((s: QualifierPlayerStat, i: number) => ({
      playerId: s.playerId,
      userCode: byId.get(s.playerId)!.userCode,
      userName: byId.get(s.playerId)!.userName,
      totalPoints: s.totalPoints,
      correctCount: s.correctCount,
      avgCorrectTimeSec: s.avgCorrectTimeSec,
      rank: i + 1,
    }));
  },
};

export function createInMemoryQualifierRepo(
  seed: QualifierQuestionRow[] = [],
): QualifierRepo & { questions: QualifierQuestionRow[] } {
  const questions = [...seed];
  const attempts = new Map<string, QualifierAttemptRow[]>();
  return {
    questions,
    async findTournamentByCode() {
      return { id: "mem-tournament" };
    },
    async countMembers() {
      return 0;
    },
    async listQuestions() {
      return [...questions].sort((a, b) => a.position - b.position);
    },
    async findQuestion(_tournamentId, questionCode) {
      return questions.find((q) => q.questionCode === questionCode) ?? null;
    },
    async createQuestion(input) {
      const row: QualifierQuestionRow = {
        id: `mem-q-${questions.length + 1}`,
        tournamentId: input.tournamentId,
        questionCode: input.questionCode,
        content: input.content,
        options: input.options,
        correctOption: input.correctOption,
        explanation: input.explanation ?? null,
        mediaUrl: input.mediaUrl ?? null,
        roundNumber: 1,
        position: input.position ?? 0,
        status: "open",
      };
      questions.push(row);
      return { id: row.id };
    },
    async updateQuestion(id, updates) {
      const q = questions.find((r) => r.id === id);
      if (!q || q.status !== "open") return false;
      Object.assign(q, updates);
      return true;
    },
    async softDeleteQuestion(id) {
      const idx = questions.findIndex((r) => r.id === id);
      if (idx < 0) return false;
      questions.splice(idx, 1);
      return true;
    },
    async listAttempts(questionId) {
      return attempts.get(questionId) ?? [];
    },
    async submitAttempt(input) {
      const q = questions.find((r) => r.id === input.questionId);
      if (!q) throw new Error("Question not found");
      if (q.status !== "open") throw new Error("Question closed");
      const isCorrect = input.selectedOption === q.correctOption;
      const list = attempts.get(input.questionId) ?? [];
      if (!list.some((a) => a.playerId === input.playerId)) {
        list.push({
          id: `mem-a-${list.length + 1}`,
          qualifierQuestionId: input.questionId,
          playerId: input.playerId,
          selectedOption: input.selectedOption,
          isCorrect,
          responseTimeMs: input.responseTimeMs,
          points: null,
        });
        attempts.set(input.questionId, list);
      }
      return { isCorrect };
    },
    async closeAndScore(questionId, totalPlayers) {
      const list = attempts.get(questionId) ?? [];
      const result = scoreQualifierQuestion(
        list.map((a) => ({
          playerId: a.playerId,
          isCorrect: a.isCorrect,
          responseTimeMs: a.responseTimeMs,
        })),
        totalPlayers,
      );
      for (const a of list) a.points = result.points[a.playerId] ?? 0;
      const q = questions.find((r) => r.id === questionId);
      if (q) q.status = "closed";
      return {
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
        noAnswerCount: result.noAnswerCount,
        perCorrect: result.perCorrect,
        perWrong: result.perWrong,
      };
    },
    async standings(_tournamentId, limit = 16) {
      const perPlayer: Record<
        string,
        Array<{ points: number; isCorrect: boolean; responseTimeMs: number }>
      > = {};
      for (const list of attempts.values()) {
        for (const a of list) {
          if (a.points === null) continue;
          (perPlayer[a.playerId] ??= []).push({
            points: a.points,
            isCorrect: a.isCorrect,
            responseTimeMs: a.responseTimeMs,
          });
        }
      }
      return rankQualifierPlayers(summarizeQualifierPlayers(perPlayer), limit).map(
        (s: QualifierPlayerStat, i: number) => ({
          playerId: s.playerId,
          userCode: s.playerId,
          userName: s.playerId,
          totalPoints: s.totalPoints,
          correctCount: s.correctCount,
          avgCorrectTimeSec: s.avgCorrectTimeSec,
          rank: i + 1,
        }),
      );
    },
  };
}
