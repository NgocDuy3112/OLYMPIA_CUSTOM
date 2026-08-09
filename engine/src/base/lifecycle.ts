/**
 * Phase transition rules.
 *
 * Defines valid phase sequences and transition guards.
 */

import type { Phase, MatchStatus } from '../types.js'

/** Valid phase order */
export const PHASE_ORDER: Phase[] = ['kdc', 'kdr', 'bp', 'vdc', 'vdr', 'gm']

/** Which phases can follow a given phase */
export const PHASE_TRANSITIONS: Record<Phase, Phase[]> = {
  kdc: ['kdr'],
  kdr: ['bp'],
  bp: ['vdc', 'vdr'],
  vdc: ['vdr', 'gm'],
  vdr: ['gm'],
  gm: [],
  vl: [], // excluded from engine — handled separately
}

/** Can we transition from currentPhase to nextPhase? */
export function canTransition(currentPhase: Phase | null, nextPhase: Phase): boolean {
  if (currentPhase === null) {
    // Match can start with any first phase
    return nextPhase === 'kdc' || nextPhase === 'kdr' || nextPhase === 'bp'
  }
  const allowed = PHASE_TRANSITIONS[currentPhase]
  return allowed.includes(nextPhase)
}

/** Match status transitions */
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
