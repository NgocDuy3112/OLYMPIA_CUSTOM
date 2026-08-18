import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { matches } from "./match";

/**
 * Questions table — v4 schema (unchanged from v3).
 */
export const questions = pgTable(
  "questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questionCode: varchar("question_code", { length: 25 }).notNull(),
    content: varchar("content").notNull(),
    answer: varchar("answer").notNull(),
    mediaUrl: varchar("media_url"),
    explanation: varchar("explanation"),
    options: varchar("options"), // JSON array stored as text: ["A","B","C"]
    isUsed: boolean("is_used").default(false),
    isDeleted: boolean("is_deleted").default(false),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("idx_questions_match_id").on(t.matchId)],
);
