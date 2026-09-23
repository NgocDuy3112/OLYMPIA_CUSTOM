import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  text,
  integer,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { matches } from "./match.js";
import { users } from "./user.js";

/**
 * Questions table — match questions use OC<number>_Q_* codes for live WS/game.
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
    hintText: varchar("hint_text"),
    options: varchar("options"), // JSON array stored as text: ["A","B","C"]
    isUsed: boolean("is_used").default(false),
    isDeleted: boolean("is_deleted").default(false),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    sourceBankId: uuid("source_bank_id"),
    // [{source, url, accessed_at}] — copy từ bank khi pick.
    citations: jsonb("citations").notNull().default([]),
    // Round slot: KDC_1..6 | KDR{1..4}_1..6 | GM_KEY/GM_H1..H8 |
    // BP_1..4 | VD_<DOMAIN>_<20|30|40|50>. One slot per match max.
    slot: varchar("slot", { length: 25 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_questions_match_id").on(t.matchId),
    index("idx_questions_source_bank").on(t.sourceBankId),
    index("idx_questions_used").on(t.matchId, t.isUsed),
    uniqueIndex("uq_questions_match_slot")
      .on(t.matchId, t.slot)
      .where(sql`${t.slot} IS NOT NULL`),
  ],
);

/**
 * Question bank — stable QB_* codes, searchable, no round prefix.
 * Pick flow copies bank -> match questions (generates OC<number>_Q_* code).
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
    hintText: varchar("hint_text"),
    options: varchar("options"),
    roundHint: varchar("round_hint", { length: 20 }),
    // Round-typed columns (single table, UI splits KĐ/GM/BP/VĐ):
    // VĐ uses domain + difficulty, GM uses setCode + hintIndex.
    domain: varchar("domain", { length: 10 }),
    difficulty: integer("difficulty"),
    setCode: varchar("set_code", { length: 50 }),
    hintIndex: varchar("hint_index", { length: 4 }),
    // [{source, url, accessed_at}] — hiển thị DD/MM/YYYY (Asia/Ho_Chi_Minh).
    citations: jsonb("citations").notNull().default([]),
    // Review workflow: new rows pending, only approved rows pickable to matches.
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    reviewNote: text("review_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    isDeleted: boolean("is_deleted").default(false),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_bank_code").on(t.bankCode),
    index("idx_bank_round_hint").on(t.roundHint),
    index("idx_bank_status").on(t.status),
    index("idx_bank_domain").on(t.domain, t.difficulty),
    index("idx_bank_set").on(t.setCode),
    uniqueIndex("uq_bank_set_hint")
      .on(t.setCode, t.hintIndex)
      .where(sql`${t.setCode} IS NOT NULL`),
    check(
      "check_bank_code_starts_with_QB",
      sql`position('QB_' in ${t.bankCode}) = 1`,
    ),
    check(
      "check_bank_status",
      sql`${t.status} IN ('pending','approved','rejected')`,
    ),
    check(
      "check_bank_domain",
      sql`${t.domain} IS NULL OR ${t.domain} IN ('THTH','TNSS','XHPL','VHNT','TTGT','KTTH')`,
    ),
    check(
      "check_bank_difficulty",
      sql`${t.difficulty} IS NULL OR ${t.difficulty} IN (20,30,40,50)`,
    ),
    check(
      "check_bank_hint_index",
      sql`${t.hintIndex} IS NULL OR ${t.hintIndex} IN ('KEY','H1','H2','H3','H4','H5','H6','H7','H8')`,
    ),
  ],
);
