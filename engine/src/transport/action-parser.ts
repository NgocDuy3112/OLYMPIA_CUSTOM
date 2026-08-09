/**
 * Action parser — converts raw WS messages to typed PlayerAction.
 */

import type { PlayerAction, Phase } from '../types.js'

const VALID_PHASES = new Set(['kdc', 'kdr', 'bp', 'vdc', 'vdr', 'gm'])

export function parseAction(raw: Record<string, unknown>): PlayerAction | null {
  const type = raw.type as string
  const userCode = (raw.user_code as string) || ''
  const matchCode = (raw.match_code as string) || ''
  const phase = (raw.phase as string) || ''

  if (!type || !userCode) return null
  if (phase && !VALID_PHASES.has(phase)) return null

  return {
    type,
    userCode,
    matchCode,
    phase: (phase || 'kdc') as Phase,
    payload: raw,
  }
}
