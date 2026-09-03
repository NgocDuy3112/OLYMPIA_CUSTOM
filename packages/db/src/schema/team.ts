import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { tournaments } from "./tournament";
import { users } from "./user";

/**
 * Tournament teams — for team-based tournaments (e.g., OC HCMC 2v2).
 */
export const tournamentTeams = pgTable(
  "tournament_teams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    teamName: varchar("team_name", { length: 100 }).notNull(),
    teamCode: varchar("team_code", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_teams_tournament").on(t.tournamentId),
    unique("uq_team_code_tournament").on(t.tournamentId, t.teamCode),
  ],
);

/**
 * Team members — links users to teams within a tournament.
 */
export const teamMembers = pgTable(
  "team_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => tournamentTeams.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => users.id),
    joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("idx_team_members_team").on(t.teamId),
    index("idx_team_members_player").on(t.playerId),
    unique("uq_team_player").on(t.teamId, t.playerId),
  ],
);
