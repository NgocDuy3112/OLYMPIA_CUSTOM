import { describe, expect, it } from "vitest";

import {
  avgCorrectTimeSec,
  qualifierQuestionPoints,
  rankQualifierPlayers,
  round3,
  scoreQualifierQuestion,
  summarizeQualifierPlayers,
} from "../../src/base/qualifier.js";

describe("qualifierQuestionPoints", () => {
  it("correct +Y, wrong -X", () => {
    expect(qualifierQuestionPoints(12, 5)).toEqual({
      perCorrect: 5,
      perWrong: -12,
    });
  });

  it("zero-sum: X*Y + Y*(-X) = 0", () => {
    const { perCorrect, perWrong } = qualifierQuestionPoints(12, 5);
    expect(12 * perCorrect + 5 * perWrong).toBe(0);
  });

  it("all correct or all wrong gives 0 each", () => {
    expect(qualifierQuestionPoints(20, 0)).toEqual({
      perCorrect: 0,
      perWrong: -20,
    });
    expect(qualifierQuestionPoints(0, 20)).toEqual({
      perCorrect: 20,
      perWrong: 0,
    });
  });
});

describe("scoreQualifierQuestion", () => {
  it("scores example X=12 Y=5 Z=3", () => {
    const attempts = [
      ...Array.from({ length: 12 }, (_, i) => ({
        playerId: `C${i}`,
        isCorrect: true,
        responseTimeMs: 1000,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        playerId: `W${i}`,
        isCorrect: false,
        responseTimeMs: 2000,
      })),
    ];
    const r = scoreQualifierQuestion(attempts, 20);
    expect(r.correctCount).toBe(12);
    expect(r.wrongCount).toBe(5);
    expect(r.noAnswerCount).toBe(3);
    expect(r.perCorrect).toBe(5);
    expect(r.perWrong).toBe(-12);
    expect(r.points["C0"]).toBe(5);
    expect(r.points["W0"]).toBe(-12);
    // zero-sum over submitted
    const total = Object.values(r.points).reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  it("blank players get no row, 0 points implied", () => {
    const r = scoreQualifierQuestion(
      [{ playerId: "P1", isCorrect: true, responseTimeMs: 500 }],
      3,
    );
    expect(r.noAnswerCount).toBe(2);
    expect(r.points).toEqual({ P1: 0 }); // Y=0 → +0
  });
});

describe("avgCorrectTimeSec", () => {
  it("rounds to 3 decimals", () => {
    expect(avgCorrectTimeSec([1000, 2000])).toBe(1.5);
    expect(avgCorrectTimeSec([1111])).toBe(1.111);
    expect(avgCorrectTimeSec([1111.1111])).toBe(round3(1.1111111));
  });

  it("no correct → Infinity (sorts last)", () => {
    expect(avgCorrectTimeSec([])).toBe(Infinity);
  });
});

describe("rankQualifierPlayers", () => {
  it("tie-break: points, then correct count, then avg time", () => {
    const stats = summarizeQualifierPlayers({
      // same points 10, same correct 2 → faster wins
      A: [
        { points: 5, isCorrect: true, responseTimeMs: 3000 },
        { points: 5, isCorrect: true, responseTimeMs: 3000 },
      ],
      B: [
        { points: 5, isCorrect: true, responseTimeMs: 1000 },
        { points: 5, isCorrect: true, responseTimeMs: 1000 },
      ],
      // same points 10 but 1 correct only → loses to 2-correct
      C: [
        { points: 10, isCorrect: true, responseTimeMs: 100 },
        { points: 0, isCorrect: false, responseTimeMs: 5000 },
      ],
      // highest points wins outright
      D: [
        { points: 20, isCorrect: true, responseTimeMs: 9000 },
        { points: -5, isCorrect: false, responseTimeMs: 9000 },
      ],
    });
    const ranked = rankQualifierPlayers(stats, 16);
    expect(ranked.map((s) => s.playerId)).toEqual(["D", "B", "A", "C"]);
    expect(ranked[1].avgCorrectTimeSec).toBe(1);
  });

  it("caps at top 16", () => {
    const perPlayer: Record<
      string,
      Array<{ points: number; isCorrect: boolean; responseTimeMs: number }>
    > = {};
    for (let i = 0; i < 20; i++) {
      perPlayer[`P${String(i).padStart(2, "0")}`] = [
        { points: 20 - i, isCorrect: true, responseTimeMs: 1000 },
      ];
    }
    const ranked = rankQualifierPlayers(
      summarizeQualifierPlayers(perPlayer),
      16,
    );
    expect(ranked).toHaveLength(16);
    expect(ranked[0].playerId).toBe("P00");
    expect(ranked[15].playerId).toBe("P15");
  });
});
