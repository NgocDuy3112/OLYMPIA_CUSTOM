import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const questionSets = pgTable(
  "question_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setCode: varchar("set_code", { length: 30 }).notNull().unique(),
    setName: varchar("set_name", { length: 100 }).notNull(),
    matchCode: varchar("match_code", { length: 25 }),
    status: varchar("status", { length: 20 }).notNull().default("draft"),
    activeMatchCode: varchar("active_match_code", { length: 25 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_qsets_match_code").on(t.matchCode),
    index("idx_qsets_status").on(t.status),
    index("idx_qsets_active_match").on(t.activeMatchCode),
  ],
);

export const questionSetItems = pgTable(
  "question_set_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    setId: uuid("set_id")
      .notNull()
      .references(() => questionSets.id, { onDelete: "cascade" }),
    round: varchar("round", { length: 10 }).notNull(),
    slot: varchar("slot", { length: 25 }).notNull(),
    bankCode: varchar("bank_code", { length: 25 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_qset_items_set_id").on(t.setId),
    uniqueIndex("uq_qset_items_set_slot")
      .on(t.setId, t.slot)
      .where(sql`${t.slot} IS NOT NULL`),
  ],
);
