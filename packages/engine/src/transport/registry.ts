/**
 * Engine registry — maps tournament format string to engine instance.
 */

import type { TournamentEngine } from "../core/engine.js";
import { OC3Engine } from "../oc3/index.js";
import { OC4Engine } from "../oc4/index.js";
import { OHCMCEngine } from "../ochcmc/index.js";

type AnyEngine = TournamentEngine<any, any, string>;

const engines = new Map<string, AnyEngine>([
  ["oc3", new OC3Engine()],
  ["oc4", new OC4Engine()],
  ["ochcmc", new OHCMCEngine()],
]);

export function getEngine(format: string): AnyEngine {
  const engine = engines.get(format);
  if (!engine) {
    throw new Error(`Unknown tournament format: ${format}`);
  }
  return engine;
}

export function registerEngine(format: string, engine: AnyEngine): void {
  engines.set(format, engine);
}

export function hasEngine(format: string): boolean {
  return engines.has(format);
}
