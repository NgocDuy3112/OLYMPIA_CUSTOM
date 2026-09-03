import { describe, expect, it } from "vitest";

import {
  applyVeDichPower,
  bpResolve,
  gmClueCorrect,
  gmKeywordCorrect,
  kdcCorrect,
  kdrCorrect,
  kdrWrong,
  vdcResolve,
  vdrScore,
} from "../../src/base/scoring.js";

describe("kdcCorrect", () => {
  it("awards 10 points", () => {
    expect(kdcCorrect("P1")).toEqual({
      userCode: "P1",
      points: 10,
      reason: "kdc_correct",
    });
  });
});

describe("kdrCorrect", () => {
  it("awards 10 on first attempt", () => {
    expect(kdrCorrect("P1", 1).points).toBe(10);
  });

  it("awards 5 on second attempt", () => {
    expect(kdrCorrect("P1", 2).points).toBe(5);
  });

  it("awards 0 from third attempt onward", () => {
    expect(kdrCorrect("P1", 3).points).toBe(0);
    expect(kdrCorrect("P1", 10).points).toBe(0);
  });
});

describe("kdrWrong", () => {
  it("awards 0 points", () => {
    expect(kdrWrong("P1")).toEqual({
      userCode: "P1",
      points: 0,
      reason: "kdr_wrong",
    });
  });
});

describe("gmClueCorrect", () => {
  it("awards 10 points", () => {
    expect(gmClueCorrect("P1").points).toBe(10);
  });
});

describe("gmKeywordCorrect", () => {
  it("awards 100 with no clues opened", () => {
    expect(gmKeywordCorrect("P1", 0).points).toBe(100);
  });

  it("penalizes 10 per opened clue", () => {
    expect(gmKeywordCorrect("P1", 3).points).toBe(70);
  });

  it("never goes below 0", () => {
    expect(gmKeywordCorrect("P1", 15).points).toBe(0);
  });

  it("honors custom config", () => {
    const delta = gmKeywordCorrect("P1", 2, {
      keywordBase: 50,
      keywordPenaltyPerClue: 5,
    });
    expect(delta.points).toBe(40);
  });
});

describe("vdrScore", () => {
  it("extracts points from question code on correct", () => {
    expect(vdrScore("P1", "OC3_Q_VD_R_15", true)).toEqual({
      userCode: "P1",
      points: 15,
      reason: "vdr_correct",
    });
  });

  it("negates points on wrong", () => {
    expect(vdrScore("P1", "OC3_Q_VD_R_15", false).points).toBe(-15);
  });

  it("falls back to 10 when code not parseable", () => {
    expect(vdrScore("P1", "OC3_Q_VD_R", true).points).toBe(10);
  });
});

describe("vdcResolve", () => {
  it("scores each player by correctness", () => {
    const deltas = vdcResolve(["P1", "P2", "P3"], ["P1", "P3"], "OC3_Q_VD_C_20");
    expect(deltas).toEqual([
      { userCode: "P1", points: 20, reason: "vdc_correct" },
      { userCode: "P2", points: -20, reason: "vdc_wrong" },
      { userCode: "P3", points: 20, reason: "vdc_correct" },
    ]);
  });

  it("returns empty array for no players", () => {
    expect(vdcResolve([], [], "OC3_Q_VD_C_20")).toEqual([]);
  });
});

describe("bpResolve", () => {
  const defaultConfig = {
    timeThresholds: [
      { maxMs: 10_000, base: 30 },
      { maxMs: 20_000, base: 20 },
      { maxMs: Infinity, base: 10 },
    ],
    positionMultipliers: [2, 1.5, 1, 0.5],
  };

  it("sorts buzzes by timestamp before scoring", () => {
    const deltas = bpResolve(
      [
        { userCode: "P2", timestamp: 5_000 },
        { userCode: "P1", timestamp: 1_000 },
      ],
      defaultConfig,
    );
    expect(deltas[0].userCode).toBe("P1");
    expect(deltas[1].userCode).toBe("P2");
  });

  it("applies time-based base points", () => {
    const deltas = bpResolve(
      [
        { userCode: "A", timestamp: 5_000 }, // <10s → 30
        { userCode: "B", timestamp: 15_000 }, // <20s → 20
        { userCode: "C", timestamp: 25_000 }, // else → 10
      ],
      defaultConfig,
    );
    expect(deltas.map((d) => d.points)).toEqual([
      30 * 2, // 1st
      20 * 1.5, // 2nd
      10 * 1, // 3rd
    ]);
  });

  it("applies position multipliers, 4th+ get 0.5", () => {
    const buzzes = [1, 2, 3, 4, 5].map((n) => ({
      userCode: `P${n}`,
      timestamp: n * 1_000,
    }));
    const deltas = bpResolve(buzzes, defaultConfig);
    // all buzzes <10s → base 30; multipliers 2/1.5/1/0.5 (clamped for 5th)
    expect(deltas.map((d) => d.points)).toEqual([60, 45, 30, 15, 15]);
  });

  it("rounds fractional results", () => {
    const deltas = bpResolve(
      [{ userCode: "P1", timestamp: 5_000 }],
      {
        timeThresholds: [{ maxMs: Infinity, base: 10 }],
        positionMultipliers: [1.5],
      },
    );
    expect(deltas[0].points).toBe(15);
  });

  it("handles empty buzz order", () => {
    expect(bpResolve([], defaultConfig)).toEqual([]);
  });
});

describe("applyVeDichPower", () => {
  it("returns points unchanged without power", () => {
    expect(applyVeDichPower(10, undefined)).toBe(10);
    expect(applyVeDichPower(-10, undefined)).toBe(-10);
  });

  it("star multiplies positive by 1.5", () => {
    expect(applyVeDichPower(20, "star")).toBe(30);
  });

  it("star leaves negative unchanged", () => {
    expect(applyVeDichPower(-20, "star")).toBe(-20);
  });

  it("shield halves positive", () => {
    expect(applyVeDichPower(20, "shield")).toBe(10);
  });

  it("shield zeroes negative", () => {
    expect(applyVeDichPower(-20, "shield")).toBe(0);
  });

  it("rounds fractional results", () => {
    expect(applyVeDichPower(15, "star")).toBe(23); // 22.5 → 23
  });

  it("zero stays zero for any power", () => {
    expect(applyVeDichPower(0, "star")).toBe(0);
    expect(applyVeDichPower(0, "shield")).toBe(0);
  });
});
