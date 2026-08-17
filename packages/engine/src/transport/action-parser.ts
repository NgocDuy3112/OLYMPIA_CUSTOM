/**
 * OC3 action parser — converts raw WS messages to typed OC3Action.
 * Other tournament formats must provide their own parser.
 */

import type { OC3Action, OC3Phase } from '../oc3/types.js'

const VALID_PHASES = new Set(['kdc', 'kdr', 'bp', 'vdc', 'vdr', 'gm'])

export function parseAction(raw: Record<string, unknown>): OC3Action | null {
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
    phase: (phase || 'kdc') as OC3Phase,
    payload: raw,
  }
}
