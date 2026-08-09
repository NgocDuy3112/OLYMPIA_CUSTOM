/**
 * Engine registry — maps tournament format string to engine instance.
 */

import type { TournamentEngine } from '../types.js'
import { OC3Engine } from '../oc3/index.js'
import { OC4Engine } from '../oc4/index.js'

const engines = new Map<string, TournamentEngine>([
  ['oc3', new OC3Engine()],
  ['oc4', new OC4Engine()],
])

export function getEngine(format: string): TournamentEngine {
  const engine = engines.get(format)
  if (!engine) {
    throw new Error(`Unknown tournament format: ${format}`)
  }
  return engine
}

export function registerEngine(format: string, engine: TournamentEngine): void {
  engines.set(format, engine)
}

export function hasEngine(format: string): boolean {
  return engines.has(format)
}
