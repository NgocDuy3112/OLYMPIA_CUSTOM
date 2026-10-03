export const OC3_CONFIG = {
  id: "oc3",
  name: "OC 3",

  scoring: {
    kdc: { correct: 10 },
    kdr: { firstTry: 10, secondTry: 5, thirdTry: 0 },
    gm: { clueCorrect: 10, keywordBase: 100, keywordPenaltyPerClue: 10 },
    bp: {
      timeThresholds: [
        { maxMs: 10_000, base: 30 },
        { maxMs: 20_000, base: 20 },
        { maxMs: Infinity, base: 10 },
      ],
      positionMultipliers: [2, 1.5, 1, 0.5],
    },
    vd: {
      defaultPoints: 10,
      penaltyMultiplier: -1,
    },
  },

  timer: {
    kdc: 60,
    kdr: 30,
    bp: 30,
    vdc: 45,
    vdr: 45,
    gm: 15,
  },

  phases: {
    kdc: {
      type: "group" as const,
      scoring: "all_correct" as const,
    },
    kdr: {
      type: "individual" as const,
      scoring: "attempts" as const,
    },
    bp: {
      type: "buzzer" as const,
      scoring: "race" as const,
    },
    vdc: {
      type: "group" as const,
      scoring: "resolve" as const,
      questionCount: 4,
    },
    vdr: {
      type: "individual" as const,
      scoring: "per_question" as const,
      questionCount: 3,
      hasPickStep: true,
    },
    gm: {
      type: "group" as const,
      scoring: "mixed" as const,
      clueCount: 8,
    },
  },
} as const;
