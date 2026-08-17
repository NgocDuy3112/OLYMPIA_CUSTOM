/**
 * OC3 — OC 3 configuration.
 *
 * All scoring values, time limits, and phase rules.
 */

export const OC3_CONFIG = {
  id: 'oc3',
  name: 'OC 3',

  // ── Scoring ──
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
      // Points extracted from question code suffix (e.g. OC3_Q_VD_R_15 → 15)
      defaultPoints: 10,
      penaltyMultiplier: -1, // negative on wrong answer
    },
  },

  // ── Time limits ──
  timer: {
    kdc: 60,
    kdr: 30,
    bp: 30,
    vdc: 45,
    vdr: 45,
    gm: 15,
  },

  // ── Phase rules ──
  phases: {
    kdc: {
      type: 'group' as const,
      scoring: 'all_correct' as const, // all players who answer correctly get points
    },
    kdr: {
      type: 'individual' as const,
      scoring: 'attempts' as const, // points depend on attempt number
    },
    bp: {
      type: 'buzzer' as const,
      scoring: 'race' as const, // points depend on buzz order + time
    },
    vdc: {
      type: 'group' as const,
      scoring: 'resolve' as const, // all players scored, correct get +, wrong get -
      questionCount: 4,
    },
    vdr: {
      type: 'individual' as const,
      scoring: 'per_question' as const, // ±points per question
      questionCount: 3,
      hasPickStep: true, // /vdr/pick precedes gameplay
    },
    gm: {
      type: 'group' as const,
      scoring: 'mixed' as const, // clue=10, keyword=100-10*clues
      clueCount: 8,
    },
  },
} as const
