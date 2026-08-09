/**
 * Scoring rules — shared between OC3 and OC4.
 *
 * All scoring logic is pure functions, no side effects.
 */

import type { ScoreDelta, VeDichPower } from '../types.js'

// ── Base points per phase ──

/** Khởi Động Chung — everyone who answers correctly gets 10 */
export function kdcCorrect(userCode: string): ScoreDelta {
  return { userCode, points: 10, reason: 'kdc_correct' }
}

/**
 * Khởi Động Cá Nhân — points depend on attempt number:
 *   1st try: 10, 2nd try: 5, 3rd+: 0
 */
export function kdrCorrect(userCode: string, attemptNumber: number): ScoreDelta {
  const points = attemptNumber === 1 ? 10 : attemptNumber === 2 ? 5 : 0
  return { userCode, points, reason: 'kdr_correct' }
}

export function kdrWrong(userCode: string): ScoreDelta {
  return { userCode, points: 0, reason: 'kdr_wrong' }
}

/** Giải Mã — clue correct */
export function gmClueCorrect(userCode: string): ScoreDelta {
  return { userCode, points: 10, reason: 'gm_clue_correct' }
}

/**
 * Giải Mã — keyword correct
 * Points: max(0, 100 - 10 * cluesOpened)
 */
export function gmKeywordCorrect(userCode: string, cluesOpened: number): ScoreDelta {
  const points = Math.max(0, 100 - 10 * cluesOpened)
  return { userCode, points, reason: 'gm_keyword_correct' }
}

/**
 * Về Đích Cá Nhân — correct/wrong
 * Question code encodes points: OC3_Q_VD_R_15 → ±15
 */
export function vdrScore(userCode: string, questionCode: string, correct: boolean): ScoreDelta {
  const points = extractVdPoints(questionCode)
  return { userCode, points: correct ? points : -points, reason: correct ? 'vdr_correct' : 'vdr_wrong' }
}

/**
 * Về Đích Chung — resolve
 * All players get ±points based on correctness
 */
export function vdcResolve(
  playerCodes: string[],
  correctCodes: string[],
  questionCode: string,
): ScoreDelta[] {
  const points = extractVdPoints(questionCode)
  return playerCodes.map((code) => ({
    userCode: code,
    points: correctCodes.includes(code) ? points : -points,
    reason: correctCodes.includes(code) ? 'vdc_correct' : 'vdc_wrong',
  }))
}

/**
 * Bứt Phá — resolve by buzz timestamp
 *
 * Base points by time: <10s → 30, <20s → 20, else → 10
 * Multiplier by position: 1st → 2×, 2nd → 1.5×, 3rd → 1×, 4th+ → 0.5×
 */
export function bpResolve(
  buzzOrder: Array<{ userCode: string; timestamp: number }>,
): ScoreDelta[] {
  const multipliers = [2, 1.5, 1, 0.5]
  const sorted = [...buzzOrder].sort((a, b) => a.timestamp - b.timestamp)

  return sorted.map((entry, index) => {
    const elapsed = entry.timestamp // already in ms from start
    const base = elapsed < 10000 ? 30 : elapsed < 20000 ? 20 : 10
    const multiplier = multipliers[Math.min(index, multipliers.length - 1)]
    return {
      userCode: entry.userCode,
      points: Math.round(base * multiplier),
      reason: 'bp_resolve',
    }
  })
}

// ── VeDich power modifiers ──

/**
 * Apply star/shield power to a score delta.
 *
 * Star: 1.5× for positive, 1× for negative
 * Shield: 0.5× for positive, 0 for negative
 */
export function applyVeDichPower(points: number, power: VeDichPower['power'] | undefined): number {
  if (!power) return points
  if (points > 0) {
    return power === 'star' ? Math.round(points * 1.5) : Math.round(points * 0.5)
  }
  if (points < 0) {
    return power === 'shield' ? 0 : points
  }
  return 0
}

// ── Helpers ──

function extractVdPoints(questionCode: string): number {
  const parts = questionCode.split('_')
  const last = parts[parts.length - 1]
  const n = parseInt(last, 10)
  return isNaN(n) ? 10 : n // fallback to 10 if parsing fails
}
