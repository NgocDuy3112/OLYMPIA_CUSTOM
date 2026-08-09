import { pgTable, uuid, varchar, text, timestamp, index } from 'drizzle-orm/pg-core'
import { auditActionTypeEnum } from './enums'

/**
 * Audit logs — v4 schema (unchanged from v3).
 * Immutable append-only log of important actions.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actionType: auditActionTypeEnum('action_type').notNull(),
    actorCode: varchar('actor_code', { length: 50 }),
    matchCode: varchar('match_code', { length: 50 }),
    targetCode: varchar('target_code', { length: 50 }),
    details: text('details'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_audit_action_type').on(t.actionType),
    index('idx_audit_actor_code').on(t.actorCode),
    index('idx_audit_match_code').on(t.matchCode),
    index('idx_audit_created_at').on(t.createdAt),
  ],
)
