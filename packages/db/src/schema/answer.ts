import { pgTable, uuid, varchar, boolean, timestamp, numeric, index } from 'drizzle-orm/pg-core'
import { users } from './user'
import { matches } from './match'
import { questions } from './question'

/**
 * Answers table — v4 schema (unchanged from v3).
 * Stores each player's answer per question per match.
 */
export const answers = pgTable(
  'answers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    answerText: varchar('answer_text'),
    hasBuzzed: boolean('has_buzzed').default(false),
    timestamp: numeric('timestamp', { precision: 16, scale: 3 }),
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
    index('idx_answers_player_id').on(t.playerId),
    index('idx_answers_match_id').on(t.matchId),
    index('idx_answers_question_id').on(t.questionId),
  ],
)
