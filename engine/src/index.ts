// ── Types ──
export type {
  Phase,
  MatchStatus,
  PlayerAction,
  ScoreDelta,
  BroadcastPayload,
  GameState,
  QuestionState,
  TimerState,
  VeDichPower,
  BuzzerWinner,
  PhaseStartResult,
  PhaseEndResult,
  ReplayPayload,
  TournamentEngine,
} from './types.js'

export { ALL_PHASES } from './types.js'

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
} from './base/scoring.js'

export { normalizeAnswer, answersMatch, isCorrectOption } from './base/validation.js'

export {
  PHASE_ORDER,
  PHASE_TRANSITIONS,
  canTransition,
  STATUS_TRANSITIONS,
  canTransitionStatus,
} from './base/lifecycle.js'

// ── Engines ──
export { OC3Engine } from './oc3/index.js'
export { OC4Engine } from './oc4/index.js'

// ── Transport ──
export { parseAction, buildBroadcastMessage, getEngine, registerEngine, hasEngine } from './transport/index.js'
