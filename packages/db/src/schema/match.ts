import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  unique,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { matchStatusEnum } from "./enums";
import { users } from "./user";
import { tournaments } from "./tournament";
import { tournamentTeams } from "./team";

/**
 * Matches table — v4 schema.
 *
 * Changes from v3:
 *   + tournament_format (default 'oc3') — which engine to use
 *   + video_url (nullable) — YouTube/Facebook live stream URL
 */
export const matches = pgTable(
  "matches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchSlug: varchar("match_slug", { length: 50 })
      .notNull()
      .unique()
      .$defaultFn(() => crypto.randomUUID()),
    matchPin: varchar("match_pin", { length: 6 }).notNull(),
    matchCode: varchar("match_code", { length: 50 }).notNull().unique(),
    matchName: varchar("match_name", { length: 100 }).notNull().unique(),
    matchStatus: matchStatusEnum("match_status").notNull().default("setup"),
    tournamentFormat: varchar("tournament_format", { length: 50 })
      .notNull()
      .default("oc3"),
    videoUrl: varchar("video_url", { length: 500 }),
    matchFormat: varchar("match_format", { length: 20 }).notNull().default("individual"),
    matchLabel: varchar("match_label", { length: 20 }),
    phaseId: uuid("phase_id"),
    team1Id: uuid("team_1_id").references(() => tournamentTeams.id),
    team2Id: uuid("team_2_id").references(() => tournamentTeams.id),
    tournamentId: uuid("tournament_id").references(() => tournaments.id),
    createdBy: uuid("created_by").references(() => users.id),
    isDeleted: boolean("is_deleted").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_matches_created_by").on(t.createdBy),
    index("idx_matches_tournament_id").on(t.tournamentId),
    index("idx_matches_phase_id").on(t.phaseId),
  ],
);

/**
 * MatchPlayerPositions — which player sits at which position (1-4) in a match.
 * Kept identical to v3.
 */
export const matchPlayerPositions = pgTable(
  "match_player_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => users.id),
    position: integer("position").notNull(),
  },
  (t) => [
    unique("uq_match_position").on(t.matchId, t.position),
    unique("uq_match_player").on(t.matchId, t.playerId),
    check(
      "check_valid_position",
      sql`${t.position} >= 1 AND ${t.position} <= 4`,
    ),
  ],
);
