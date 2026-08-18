import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./user";
import { matches } from "./match";
import { questions } from "./question";

/**
 * Records table — v4 schema (unchanged from v3).
 * Score records: points earned per question per player.
 */
export const records = pgTable(
  "records",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    points: integer("points").notNull(),
    isDeleted: boolean("is_deleted").default(false),
    playerId: uuid("player_id")
      .notNull()
      .references(() => users.id),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id),
    roundNumber: integer("round_number"),
    questionCode: varchar("question_code", { length: 25 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check("check_points_multiple_of_5", sql`${t.points} % 5 = 0`),
    index("idx_records_player_id").on(t.playerId),
    index("idx_records_match_id").on(t.matchId),
    index("idx_records_question_id").on(t.questionId),
  ],
);
