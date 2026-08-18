/** OC4 scoring adapters. Values come from OC4_CONFIG. */

import { bpResolve, gmKeywordCorrect } from "../base/scoring.js";
import type { ScoreDelta } from "../types.js";
import { OC4_CONFIG } from "./config.js";

export function kdrCorrectOnce(userCode: string): ScoreDelta {
  return {
    userCode,
    points: OC4_CONFIG.scoring.kdr.oneAttempt,
    reason: "kdr_correct",
  };
}

export function kdrWrongOnce(userCode: string): ScoreDelta {
  return {
    userCode,
    points: OC4_CONFIG.scoring.kdr.wrong,
    reason: "kdr_wrong",
  };
}

export function gmKeywordCorrectOc4(
  userCode: string,
  cluesOpened: number,
): ScoreDelta {
  return gmKeywordCorrect(userCode, cluesOpened, OC4_CONFIG.scoring.gm);
}

export function bpResolveOc4(
  buzzOrder: Array<{ userCode: string; timestamp: number }>,
): ScoreDelta[] {
  return bpResolve(buzzOrder, OC4_CONFIG.scoring.bp);
}
