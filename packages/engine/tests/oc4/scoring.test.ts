import { describe, expect, it } from "vitest";

import {
  bpResolveOc4,
  gmKeywordCorrectOc4,
  kdrCorrectOnce,
  kdrWrongOnce,
} from "../../src/oc4/scoring.js";
import { OC4_CONFIG } from "../../src/oc4/config.js";

describe("OC4 scoring adapters", () => {
  it("kdr awards single-attempt value from config", () => {
    expect(kdrCorrectOnce("P1")).toEqual({
      userCode: "P1",
      points: OC4_CONFIG.scoring.kdr.oneAttempt,
      reason: "kdr_correct",
    });
    expect(OC4_CONFIG.scoring.kdr.oneAttempt).toBe(10);
  });

  it("kdr wrong awards config wrong value", () => {
    expect(kdrWrongOnce("P1")).toEqual({
      userCode: "P1",
      points: OC4_CONFIG.scoring.kdr.wrong,
      reason: "kdr_wrong",
    });
    expect(OC4_CONFIG.scoring.kdr.wrong).toBe(0);
  });

  it("gm clue awards 0 in OC4", () => {
    // OC4 config sets clueCorrect: 0 — keyword-only scoring.
    expect(OC4_CONFIG.scoring.gm.clueCorrect).toBe(0);
  });

  it("gm keyword uses OC4 base/penalty", () => {
    // base 80, penalty 5 per clue
    expect(gmKeywordCorrectOc4("P1", 0).points).toBe(80);
    expect(gmKeywordCorrectOc4("P1", 4).points).toBe(60);
    expect(gmKeywordCorrectOc4("P1", 99).points).toBe(0);
  });

  it("bp resolve uses OC4 thresholds and multipliers", () => {
    // <5s → 15, <15s → 10, else → 5; multipliers 4/3/2/1
    const deltas = bpResolveOc4([
      { userCode: "A", timestamp: 3_000 },
      { userCode: "B", timestamp: 8_000 },
      { userCode: "C", timestamp: 20_000 },
      { userCode: "D", timestamp: 25_000 },
    ]);
    expect(deltas.map((d) => d.points)).toEqual([
      60, // 15 * 4
      30, // 10 * 3
      10, // 5 * 2
      5, // 5 * 1
    ]);
  });

  it("oc4 timer kdr differs from oc3", () => {
    expect(OC4_CONFIG.timer.kdr).toBe(45);
  });
});
