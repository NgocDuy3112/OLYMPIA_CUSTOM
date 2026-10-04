export type {
  TournamentEngine,
  Result,
  DomainEvent,
  DomainError,
} from "./core/index.js";
export { success, failure } from "./core/index.js";

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
  normalizeMathAnswer,
  mathAnswersEqual,
  answersMatch,
  isCorrectOption,
} from "./base/validation.js";

export {
  round3,
  QUALIFIER_TIME_LIMIT_MS,
  QUALIFIER_TIME_LIMIT_SEC,
  isQualifierTimeout,
  qualifierQuestionPoints,
  scoreQualifierQuestion,
  avgCorrectTimeSec,
  summarizeQualifierPlayers,
  rankQualifierPlayers,
} from "./base/qualifier.js";
export type {
  QualifierAttemptInput,
  QualifierQuestionResult,
  QualifierPlayerStat,
} from "./base/qualifier.js";

export { OC3Engine } from "./oc3/index.js";
export { OC4Engine } from "./oc4/index.js";

export { getEngine } from "./transport/index.js";
