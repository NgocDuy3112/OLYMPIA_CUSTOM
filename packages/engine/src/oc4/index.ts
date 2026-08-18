/**
 * OC4 Engine — OC 4.
 *
 * Currently identical to OC3. Override methods here as OC4 diverges.
 */

import { OC3Engine } from "../oc3/index.js";
import type { ScoreDelta } from "../types.js";
import type { OC3State, OC3Action } from "../oc3/types.js";
import { OC4_CONFIG } from "./config.js";
import {
  bpResolveOc4,
  gmKeywordCorrectOc4,
  kdrCorrectOnce,
  kdrWrongOnce,
} from "./scoring.js";

export class OC4Engine extends OC3Engine {
  override readonly id: string = OC4_CONFIG.id;
  override readonly name: string = OC4_CONFIG.name;

  override calculateScore(action: OC3Action, state: OC3State): ScoreDelta[] {
    if (action.type === "kdr_correct") {
      return [kdrCorrectOnce(action.userCode)];
    }

    if (action.type === "kdr_wrong") {
      return [kdrWrongOnce(action.userCode)];
    }

    if (action.type === "gm_keyword_correct") {
      const cluesOpened =
        state.gmPlayerStates[action.userCode]?.cluesOpened ?? 0;
      return [gmKeywordCorrectOc4(action.userCode, cluesOpened)];
    }

    // Clue opening itself has no score delta in OC4.
    if (action.type === "gm_clue_correct") {
      return [];
    }

    if (action.type === "bp_resolve") {
      const buzzOrder = state.buzzOrder.map((code) => ({
        userCode: code,
        timestamp: state.buzzTimestamps[code] || 0,
      }));
      return bpResolveOc4(buzzOrder).map((delta) => {
        const power = state.veDichPowers.find(
          (p) => p.userCode === delta.userCode,
        )?.power;
        return { ...delta, points: this.applyPower(delta.points, power) };
      });
    }

    return super.calculateScore(action, state);
  }

  private applyPower(
    points: number,
    power: "star" | "shield" | undefined,
  ): number {
    if (!power) return points;
    if (points > 0)
      return power === "star"
        ? Math.round(points * 1.5)
        : Math.round(points * 0.5);
    if (points < 0 && power === "shield") return 0;
    return points;
  }
}
