import type { MatchStatus } from '../types.js'

/** Match status transitions are transport-level lifecycle, not tournament phase rules. */
export const STATUS_TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  setup: ['active'],
  active: ['in_progress', 'paused'],
  in_progress: ['paused', 'completed'],
  paused: ['in_progress', 'active'],
  completed: ['finished'],
  finished: [],
}

export function canTransitionStatus(current: MatchStatus, next: MatchStatus): boolean {
  return STATUS_TRANSITIONS[current]?.includes(next) ?? false
}
