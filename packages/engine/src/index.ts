// ── Engine contract ──
export type {
  TournamentEngine,
  Result,
  DomainEvent,
  DomainError,
} from "./core/index.js";
export { success, failure } from "./core/index.js";

// ── Shared types ──
export type {
  MatchStatus,
  ScoreDelta,
  BroadcastPayload,
  QuestionState,
  TimerState,
  VeDichPower,
  BuzzerWinner,
  ReplayPayload,
} from "./types.js";

export type { OC3State, OC3Action, OC3Phase } from "./oc3/types.js";
export type { OHCMCState, OHCMCAction, OHCMCPhase } from "./ochcmc/types.js";

// ── Base utilities ──
export {
  kdcCorrect,
  kdrCorrect,
  kdrWrong,
  gmClueCorrect,
  gmKeywordCorrect,
  vdrScore,
  vdcResolve,
  bpResolve,
  applyVeDichPower,
} from "./base/scoring.js";

export {
  normalizeAnswer,
  answersMatch,
  isCorrectOption,
} from "./base/validation.js";

export { STATUS_TRANSITIONS, canTransitionStatus } from "./base/lifecycle.js";

// ── Engines ──
export { OC3Engine } from "./oc3/index.js";
export { OC4Engine } from "./oc4/index.js";
export { OHCMCEngine } from "./ochcmc/index.js";

// ── Transport ──
export {
  parseAction,
  buildBroadcastMessage,
  getEngine,
  registerEngine,
  hasEngine,
} from "./transport/index.js";
