import { pgTable, uuid, varchar, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

/**
 * Match checkpoints — NEW in v4.
 *
 * Valkey is ephemeral — a crash loses all in-memory state.
 * This table stores periodic snapshots of the Valkey match state
 * so it can be recovered after a crash.
 *
 * Schedule: every 30s, keep latest 10 per match.
 */
export const matchCheckpoints = pgTable(
  'match_checkpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchCode: varchar('match_code', { length: 50 }).notNull(),
    checkpoint: jsonb('checkpoint').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_checkpoint_match_time').on(t.matchCode, t.createdAt),
  ],
)
