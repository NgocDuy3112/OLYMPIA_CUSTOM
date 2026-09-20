import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tournaments } from "./tournament.js";
import { users } from "./user.js";

/**
 * Qualifier questions — multiple-choice screening round per tournament (option A).
 *
 * One tournament shares one qualifier set; players take it before matches
 * are drawn. Each question has 4-6 options and exactly one correct answer.
 */
export const qualifierQuestions = pgTable(
  "qualifier_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    questionCode: varchar("question_code", { length: 25 }).notNull(),
    content: varchar("content").notNull(),
    // JSON array of option texts: ["...","...","...","..."] (4-6 items)
    options: jsonb("options").notNull(),
    // Single correct answer: one of A/B/C/D/E/F
    correctOption: varchar("correct_option", { length: 1 }).notNull(),
    explanation: varchar("explanation"),
    mediaUrl: varchar("media_url"),
    roundNumber: integer("round_number").notNull().default(1),
    position: integer("position").notNull().default(0),
    isDeleted: boolean("is_deleted").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_qualifier_questions_tournament").on(t.tournamentId),
    unique("uq_qualifier_question_code").on(t.tournamentId, t.questionCode),
    check(
      "check_qualifier_options_4_to_6",
      sql`jsonb_array_length(${t.options}) BETWEEN 4 AND 6`,
    ),
    check(
      "check_qualifier_correct_option",
      sql`${t.correctOption} IN ('A','B','C','D','E','F')`,
    ),
  ],
);

/**
 * Qualifier attempts — one row per player per question.
 * Ranking derives from is_correct count + response_time_ms (no extra table).
 */
export const qualifierAttempts = pgTable(
  "qualifier_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    qualifierQuestionId: uuid("qualifier_question_id")
      .notNull()
      .references(() => qualifierQuestions.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    selectedOption: varchar("selected_option", { length: 1 }).notNull(),
    isCorrect: boolean("is_correct").notNull().default(false),
    responseTimeMs: integer("response_time_ms").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_qualifier_attempts_question").on(t.qualifierQuestionId),
    index("idx_qualifier_attempts_player").on(t.playerId),
    unique("uq_qualifier_attempt").on(t.qualifierQuestionId, t.playerId),
    check(
      "check_qualifier_selected_option",
      sql`${t.selectedOption} IN ('A','B','C','D','E','F')`,
    ),
  ],
);
