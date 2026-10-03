import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tournaments } from "./tournament.js";
import { matches } from "./match.js";

export const tournamentPhases = pgTable(
  "tournament_phases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    phaseNumber: integer("phase_number").notNull(),
    phaseName: varchar("phase_name", { length: 100 }).notNull(),
    phaseType: varchar("phase_type", { length: 20 }).notNull().default("group_stage"),
    matchCount: integer("match_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_phases_tournament").on(t.tournamentId),
    unique("uq_phase_number").on(t.tournamentId, t.phaseNumber),
  ],
);

export const bracketEdges = pgTable(
  "bracket_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fromMatchId: uuid("from_match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    toMatchId: uuid("to_match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_bracket_from").on(t.fromMatchId),
    index("idx_bracket_to").on(t.toMatchId),
    unique("uq_bracket_edge").on(t.fromMatchId, t.rank, t.toMatchId),
    check("check_bracket_rank", sql`${t.rank} >= 1 AND ${t.rank} <= 4`),
  ],
);
