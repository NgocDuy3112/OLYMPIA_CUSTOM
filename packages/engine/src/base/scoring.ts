
import type { ScoreDelta, VeDichPower } from "../types.js";


export function kdcCorrect(userCode: string): ScoreDelta {
  return { userCode, points: 10, reason: "kdc_correct" };
}

export function kdrCorrect(
  userCode: string,
  attemptNumber: number,
): ScoreDelta {
  const points = attemptNumber === 1 ? 10 : attemptNumber === 2 ? 5 : 0;
  return { userCode, points, reason: "kdr_correct" };
}

export function kdrWrong(userCode: string): ScoreDelta {
  return { userCode, points: 0, reason: "kdr_wrong" };
}

export function gmClueCorrect(userCode: string): ScoreDelta {
  return { userCode, points: 10, reason: "gm_clue_correct" };
}

export function gmKeywordCorrect(
  userCode: string,
  cluesOpened: number,
  config = { keywordBase: 100, keywordPenaltyPerClue: 10 },
): ScoreDelta {
  const points = Math.max(
    0,
    config.keywordBase - config.keywordPenaltyPerClue * cluesOpened,
  );
  return { userCode, points, reason: "gm_keyword_correct" };
}

export function vdrScore(
  userCode: string,
  questionCode: string,
  correct: boolean,
): ScoreDelta {
  const points = extractVdPoints(questionCode);
  return {
    userCode,
    points: correct ? points : -points,
    reason: correct ? "vdr_correct" : "vdr_wrong",
  };
}

export function vdcResolve(
  playerCodes: string[],
  correctCodes: string[],
  questionCode: string,
): ScoreDelta[] {
  const points = extractVdPoints(questionCode);
  return playerCodes.map((code) => ({
    userCode: code,
    points: correctCodes.includes(code) ? points : -points,
    reason: correctCodes.includes(code) ? "vdc_correct" : "vdc_wrong",
  }));
}

export function bpResolve(
  buzzOrder: Array<{ userCode: string; timestamp: number }>,
  config: {
    readonly timeThresholds: readonly {
      readonly maxMs: number;
      readonly base: number;
    }[];
    readonly positionMultipliers: readonly number[];
  } = {
    timeThresholds: [
      { maxMs: 10_000, base: 30 },
      { maxMs: 20_000, base: 20 },
      { maxMs: Infinity, base: 10 },
    ],
    positionMultipliers: [2, 1.5, 1, 0.5],
  },
): ScoreDelta[] {
  const sorted = [...buzzOrder].sort((a, b) => a.timestamp - b.timestamp);

  return sorted.map((entry, index) => {
    const elapsed = entry.timestamp;
    const base =
      config.timeThresholds.find((threshold) => elapsed < threshold.maxMs)
        ?.base ??
      config.timeThresholds[config.timeThresholds.length - 1]?.base ??
      0;
    const multiplier =
      config.positionMultipliers[
        Math.min(index, config.positionMultipliers.length - 1)
      ] ?? 0;
    return {
      userCode: entry.userCode,
      points: Math.round(base * multiplier),
      reason: "bp_resolve",
    };
  });
}


export function applyVeDichPower(
  points: number,
  power: VeDichPower["power"] | undefined,
): number {
  if (!power) return points;
  if (points > 0) {
    return power === "star"
      ? Math.round(points * 1.5)
      : Math.round(points * 0.5);
  }
  if (points < 0) {
    return power === "shield" ? 0 : points;
  }
  return 0;
}


function extractVdPoints(questionCode: string): number {
  const parts = questionCode.split("_");
  const last = parts[parts.length - 1];
  const n = parseInt(last, 10);
  return isNaN(n) ? 10 : n;
}
