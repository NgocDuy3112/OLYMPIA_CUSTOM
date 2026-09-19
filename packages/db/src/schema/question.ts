import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { matches } from "./match.js";
import { users } from "./user.js";

/**
 * Questions table — match questions use OC3_Q_* codes for live WS/game.
 * Bank rows live in question_bank (QB_* codes) — see below.
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
    sourceBankId: uuid("source_bank_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_questions_match_id").on(t.matchId),
    index("idx_questions_source_bank").on(t.sourceBankId),
    index("idx_questions_used").on(t.matchId, t.isUsed),
  ],
);

/**
 * Question bank — stable QB_* codes, searchable, no round prefix.
 * Pick flow copies bank -> match questions (generates OC3_Q_* code).
 */
export const questionBank = pgTable(
  "question_bank",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bankCode: varchar("bank_code", { length: 25 }).notNull().unique(),
    content: varchar("content").notNull(),
    answer: varchar("answer").notNull(),
    mediaUrl: varchar("media_url"),
    explanation: varchar("explanation"),
    options: varchar("options"),
    tags: varchar("tags", { length: 200 }),
    roundHint: varchar("round_hint", { length: 20 }),
    isDeleted: boolean("is_deleted").default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_bank_code").on(t.bankCode),
    index("idx_bank_round_hint").on(t.roundHint),
    index("idx_bank_tags").on(t.tags),
    check(
      "check_bank_code_starts_with_QB",
      sql`position('QB_' in ${t.bankCode}) = 1`,
    ),
  ],
);
