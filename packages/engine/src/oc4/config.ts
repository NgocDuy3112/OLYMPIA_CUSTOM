import { OC3_CONFIG } from "../oc3/config.js";

export const OC4_CONFIG = {
  ...OC3_CONFIG,
  id: "oc4",
  name: "OC 4",
  scoring: {
    ...OC3_CONFIG.scoring,
    kdr: { oneAttempt: 10, wrong: 0 },
    gm: {
      ...OC3_CONFIG.scoring.gm,
      clueCorrect: 0,
      keywordBase: 80,
      keywordPenaltyPerClue: 5,
    },
    bp: {
      timeThresholds: [
        { maxMs: 5_000, base: 15 },
        { maxMs: 15_000, base: 10 },
        { maxMs: Infinity, base: 5 },
      ],
      positionMultipliers: [4, 3, 2, 1],
    },
  },
  timer: {
    ...OC3_CONFIG.timer,
    kdr: 45,
  },
  phases: {
    ...OC3_CONFIG.phases,
    kdr: {
      ...OC3_CONFIG.phases.kdr,
      scoring: "one_attempt" as const,
    },
    bp: {
      ...OC3_CONFIG.phases.bp,
      answerDelayMs: 1_500,
    },
    vdc: {
      ...OC3_CONFIG.phases.vdc,
      questionCount: "players" as const,
    },
  },
} as const;
