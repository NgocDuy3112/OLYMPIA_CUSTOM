/**
 * OC4 — OC 4 configuration.
 *
 * OC4 rules diverge from OC3 in KDR and Giải mã scoring.
 */

import { OC3_CONFIG } from '../oc3/config.js'

export const OC4_CONFIG = {
  ...OC3_CONFIG,
  id: 'oc4',
  name: 'OC 4',
  // KDR: one attempt; wrong answer scores 0.
  // Giải mã: clue opening scores 0; keyword starts at 80 and loses 5 per clue.
} as const
