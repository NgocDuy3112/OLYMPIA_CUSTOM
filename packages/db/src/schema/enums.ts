import { pgEnum } from 'drizzle-orm/pg-core'

// ── Role enum ──
// v3 had 'guest' in the DB enum. We keep it for backward compatibility
// but v4 backend/frontend will not create new guest users.
export const roleEnum = pgEnum('roleenum', ['guest', 'player', 'mc', 'admin'])

// ── Match status enum ──
export const matchStatusEnum = pgEnum('matchstatusenum', [
  'setup',
  'active',
  'in_progress',
  'paused',
  'completed',
  'finished',
])

// ── Audit action type enum ──
export const auditActionTypeEnum = pgEnum('auditactiontype', [
  'LOGIN',
  'LOGOUT',
  'SCORE_CHANGE',
  'MATCH_STATE_CHANGE',
  'PLAYER_JOIN',
  'PLAYER_LEAVE',
  'QUESTION_USED',
  'MATCH_CREATED',
  'MATCH_DELETED',
])
