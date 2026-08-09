import { pgTable, uuid, varchar, integer, doublePrecision, boolean, timestamp, index } from 'drizzle-orm/pg-core'
import { users } from './user'
import { matches } from './match'
import { questions } from './question'

/**
 * Qualifier records — v4 schema (unchanged from v3).
 * Per-question results during the Vòng Loại phase.
 */
export const qualifierRecords = pgTable(
  'qualifier_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    points: integer('points').notNull(),
    responseTime: doublePrecision('response_time'),
    isCorrect: boolean('is_correct').notNull().default(false),
    roundNumber: integer('round_number').notNull().default(1),
    chosenOption: varchar('chosen_option', { length: 1 }),
    isDeleted: boolean('is_deleted').default(false),
    playerId: uuid('player_id')
      .notNull()
      .references(() => users.id),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_qr_player_id').on(t.playerId),
    index('idx_qr_match_id').on(t.matchId),
    index('idx_qr_question_id').on(t.questionId),
  ],
)

/**
 * Qualifier advancements — v4 schema (unchanged from v3).
 * Tracks which players advance from each qualifier round.
 */
export const qualifierAdvancements = pgTable(
  'qualifier_advancements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => users.id),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id),
    roundNumber: integer('round_number').notNull(),
    status: varchar('status', { length: 16 }).notNull(),
    isDeleted: boolean('is_deleted').default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_qa_player_id').on(t.playerId),
    index('idx_qa_match_id').on(t.matchId),
  ],
)
