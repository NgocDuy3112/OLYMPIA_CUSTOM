import {
  pgTable, uuid, varchar, boolean, timestamp, date, text,
  index,
} from 'drizzle-orm/pg-core'
import { users } from './user'

/**
 * Tournament status enum values
 */
export type TournamentStatus = 'draft' | 'active' | 'completed' | 'archived'

/**
 * Tournaments table — manages tournament/league competitions.
 *
 * Each tournament can have multiple matches and players.
 */
export const tournaments = pgTable(
  'tournaments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tournamentCode: varchar('tournament_code', { length: 50 }).notNull().unique(),
    tournamentName: varchar('tournament_name', { length: 200 }).notNull(),
    description: text('description'),
    tournamentFormat: varchar('tournament_format', { length: 50 }).notNull().default('oc3'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    maxPlayers: varchar('max_players', { length: 10 }),
    venue: varchar('venue', { length: 200 }),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id),
    isDeleted: boolean('is_deleted').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_tournaments_created_by').on(t.createdBy),
    index('idx_tournaments_status').on(t.status),
  ],
)

/**
 * TournamentPlayers — tracks which players are registered for a tournament.
 */
export const tournamentPlayers = pgTable(
  'tournament_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    tournamentId: uuid('tournament_id')
      .notNull()
      .references(() => tournaments.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => users.id),
    groupNumber: varchar('group_number', { length: 20 }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_tournament_players_tournament').on(t.tournamentId),
    index('idx_tournament_players_player').on(t.playerId),
  ],
)
