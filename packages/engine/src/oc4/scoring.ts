/** OC4-only scoring rules. */

import type { ScoreDelta } from '../types.js'

/** KDR: one attempt only; correct answer earns 10, wrong answer earns 0. */
export function kdrCorrectOnce(userCode: string): ScoreDelta {
  return { userCode, points: 10, reason: 'kdr_correct' }
}

/** Giải mã keyword: 80 points base, minus 5 per opened clue. */
export function gmKeywordCorrectOc4(userCode: string, cluesOpened: number): ScoreDelta {
  const points = Math.max(0, 80 - 5 * Math.max(0, cluesOpened))
  return { userCode, points, reason: 'gm_keyword_correct' }
}
