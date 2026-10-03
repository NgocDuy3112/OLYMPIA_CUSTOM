import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { matches } from "./match.js";
import { questions } from "./question.js";

export type ScoreReviewStatus = "pending" | "decided" | "expired";

export const scoreReviews = pgTable(
  "score_reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    matchCode: varchar("match_code", { length: 50 }).notNull(),
    questionCode: varchar("question_code", { length: 25 }).notNull(),
    candidates: jsonb("candidates").notNull(),
    decisions: jsonb("decisions").notNull().default({}),
    oceeSuggestion: jsonb("ocee_suggestion"),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    createdBy: varchar("created_by", { length: 50 }),
    decidedBy: varchar("decided_by", { length: 50 }),
    discordMessageId: varchar("discord_message_id", { length: 32 }),
    discordChannelId: varchar("discord_channel_id", { length: 32 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_score_reviews_match").on(t.matchId, t.status),
    index("idx_score_reviews_question").on(t.questionId, t.status),
  ],
);
