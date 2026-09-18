import { and, eq } from "drizzle-orm";
import {
  db,
  scoreReviews,
  questions,
  users,
  answers,
  matchPlayerPositions,
} from "@oc/db";
import { AppError } from "../../utils/errors.js";

export interface ScoreReviewCandidate {
  userCode: string;
  userName: string;
  position: number | null;
  answerText: string;
}

export interface CandidateInput {
  userCode: string;
  answerText?: string;
}

export type ScoreReviewRow = typeof scoreReviews.$inferSelect;

export interface QuestionContent {
  content: string;
  answer: string;
}

export interface CreateScoreReviewInput {
  matchId: string;
  questionId: string;
  matchCode: string;
  questionCode: string;
  candidates: ScoreReviewCandidate[];
  createdBy?: string;
  expiresAt: Date;
}

export interface ScoreReviewRepo {
  findById(id: string): Promise<ScoreReviewRow | null>;
  create(input: CreateScoreReviewInput): Promise<{ id: string }>;
  markExpired(id: string): Promise<void>;
  decide(
    id: string,
    decisions: Record<string, string>,
    decidedBy: string | null,
    oceeSuggestion: unknown,
  ): Promise<void>;
  saveOceeSuggestion(id: string, suggestion: unknown): Promise<void>;
  findQuestionContent(questionId: string): Promise<QuestionContent | null>;
  buildCandidates(
    matchId: string,
    questionId: string,
    inputs: CandidateInput[],
  ): Promise<ScoreReviewCandidate[]>;
}

export const drizzleScoreReviewRepo: ScoreReviewRepo = {
  async findById(id: string): Promise<ScoreReviewRow | null> {
    const rows = await db
      .select()
      .from(scoreReviews)
      .where(eq(scoreReviews.id, id))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(input: CreateScoreReviewInput): Promise<{ id: string }> {
    const inserted = await db
      .insert(scoreReviews)
      .values({
        matchId: input.matchId,
        questionId: input.questionId,
        matchCode: input.matchCode,
        questionCode: input.questionCode,
        candidates: input.candidates,
        decisions: {},
        status: "pending",
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
      })
      .returning({ id: scoreReviews.id });
    return inserted[0];
  },

  async markExpired(id: string): Promise<void> {
    await db
      .update(scoreReviews)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(scoreReviews.id, id));
  },

  async decide(
    id: string,
    decisions: Record<string, string>,
    decidedBy: string | null,
    oceeSuggestion: unknown,
  ): Promise<void> {
    await db
      .update(scoreReviews)
      .set({
        decisions,
        decidedBy,
        oceeSuggestion: oceeSuggestion as never,
        status: "decided",
        updatedAt: new Date(),
      })
      .where(eq(scoreReviews.id, id));
  },

  async saveOceeSuggestion(id: string, suggestion: unknown): Promise<void> {
    await db
      .update(scoreReviews)
      .set({ oceeSuggestion: suggestion as never, updatedAt: new Date() })
      .where(eq(scoreReviews.id, id));
  },

  async findQuestionContent(
    questionId: string,
  ): Promise<QuestionContent | null> {
    const rows = await db
      .select({ content: questions.content, answer: questions.answer })
      .from(questions)
      .where(eq(questions.id, questionId))
      .limit(1);
    return rows[0] ?? null;
  },

  async buildCandidates(
    matchId: string,
    questionId: string,
    inputs: CandidateInput[],
  ): Promise<ScoreReviewCandidate[]> {
    const out: ScoreReviewCandidate[] = [];
    for (const input of inputs) {
      const userRows = await db
        .select({ id: users.id, userName: users.userName })
        .from(users)
        .where(
          and(eq(users.userCode, input.userCode), eq(users.isDeleted, false)),
        )
        .limit(1);
      if (userRows.length === 0)
        throw new AppError(404, `Player not found: ${input.userCode}`);
      let answerText = input.answerText ?? "";
      if (!answerText) {
        const answerRows = await db
          .select({ answerText: answers.answerText })
          .from(answers)
          .where(
            and(
              eq(answers.matchId, matchId),
              eq(answers.playerId, userRows[0].id),
              eq(answers.questionId, questionId),
              eq(answers.isDeleted, false),
            ),
          )
          .limit(1);
        answerText = answerRows[0]?.answerText ?? "";
      }
      const posRows = await db
        .select({ position: matchPlayerPositions.position })
        .from(matchPlayerPositions)
        .where(
          and(
            eq(matchPlayerPositions.matchId, matchId),
            eq(matchPlayerPositions.playerId, userRows[0].id),
          ),
        )
        .limit(1);
      out.push({
        userCode: input.userCode,
        userName: userRows[0].userName,
        position: posRows[0]?.position ?? null,
        answerText,
      });
    }
    out.sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    return out;
  },
};

export function createInMemoryScoreReviewRepo(
  seed: ScoreReviewRow[] = [],
): ScoreReviewRepo & { rows: ScoreReviewRow[] } {
  const rows = [...seed];
  const questionContents = new Map<string, QuestionContent>();
  return {
    rows,
    async findById(id: string) {
      return rows.find((r) => r.id === id) ?? null;
    },
    async create(input: CreateScoreReviewInput) {
      const row = {
        id: `mem-${rows.length + 1}`,
        matchId: input.matchId,
        questionId: input.questionId,
        matchCode: input.matchCode,
        questionCode: input.questionCode,
        candidates: input.candidates,
        decisions: {},
        oceeSuggestion: null,
        status: "pending",
        createdBy: input.createdBy ?? null,
        decidedBy: null,
        discordMessageId: null,
        discordChannelId: null,
        expiresAt: input.expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as ScoreReviewRow;
      rows.push(row);
      return { id: row.id };
    },
    async markExpired(id: string) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        (row as { status: string }).status = "expired";
        row.updatedAt = new Date();
      }
    },
    async decide(
      id: string,
      decisions: Record<string, string>,
      decidedBy: string | null,
      oceeSuggestion: unknown,
    ) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        (row as { decisions: unknown }).decisions = decisions;
        (row as { decidedBy: unknown }).decidedBy = decidedBy;
        (row as { oceeSuggestion: unknown }).oceeSuggestion = oceeSuggestion;
        (row as { status: string }).status = "decided";
        row.updatedAt = new Date();
      }
    },
    async saveOceeSuggestion(id: string, suggestion: unknown) {
      const row = rows.find((r) => r.id === id);
      if (row) {
        (row as { oceeSuggestion: unknown }).oceeSuggestion = suggestion;
        row.updatedAt = new Date();
      }
    },
    async findQuestionContent(questionId: string) {
      return questionContents.get(questionId) ?? null;
    },
    async buildCandidates(
      _matchId: string,
      _questionId: string,
      inputs: CandidateInput[],
    ) {
      return inputs.map((input, idx) => ({
        userCode: input.userCode,
        userName: input.userCode,
        position: idx + 1,
        answerText: input.answerText ?? "",
      }));
    },
  };
}
