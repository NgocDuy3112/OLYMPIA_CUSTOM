/**
 * OC4 — OC 4 configuration.
 *
 * Same gameplay as OC3. Future: may diverge with new rules.
 */

import { OC3_CONFIG } from '../oc3/config.js'

export const OC4_CONFIG = {
  ...OC3_CONFIG,
  id: 'oc4',
  name: 'OC 4',
  // Override any rules here as OC4 evolves
} as const
