import { describe, expect, it } from "vitest";
import { createInMemoryQualifierRepo } from "../src/modules/qualifier/qualifier.repo.js";

const OPTS = ["Hà Nội", "Huế", "Đà Nẵng", "TP. Hồ Chí Minh"];

describe("qualifier repo (in-memory)", () => {
  it("creates + lists questions in position order", async () => {
    const repo = createInMemoryQualifierRepo();
    await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_02",
      content: "Q2",
      options: OPTS,
      correctOption: "A",
      position: 2,
    });
    await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_01",
      content: "Q1",
      options: OPTS,
      correctOption: "A",
      position: 1,
    });
    const rows = await repo.listQuestions("t1");
    expect(rows.map((r) => r.questionCode)).toEqual(["VL_01", "VL_02"]);
  });

  it("scores zero-sum on close: X=2 Y=1 Z=1", async () => {
    const repo = createInMemoryQualifierRepo();
    const { id } = await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_01",
      content: "Thủ đô?",
      options: OPTS,
      correctOption: "A",
      position: 1,
    });
    await repo.submitAttempt({
      questionId: id,
      playerId: "p1",
      selectedOption: "A",
      responseTimeMs: 1000,
    });
    await repo.submitAttempt({
      questionId: id,
      playerId: "p2",
      selectedOption: "A",
      responseTimeMs: 2000,
    });
    await repo.submitAttempt({
      questionId: id,
      playerId: "p3",
      selectedOption: "B",
      responseTimeMs: 1500,
    });
    const result = await repo.closeAndScore(id, 4);
    expect(result).toEqual({
      correctCount: 2,
      wrongCount: 1,
      noAnswerCount: 1,
      perCorrect: 1,
      perWrong: -2,
    });
    const attempts = await repo.listAttempts(id);
    expect(attempts.find((a) => a.playerId === "p1")?.points).toBe(1);
    expect(attempts.find((a) => a.playerId === "p3")?.points).toBe(-2);
  });

  it("rejects submit after close", async () => {
    const repo = createInMemoryQualifierRepo();
    const { id } = await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_01",
      content: "Q",
      options: OPTS,
      correctOption: "A",
      position: 1,
    });
    await repo.closeAndScore(id, 1);
    await expect(
      repo.submitAttempt({
        questionId: id,
        playerId: "p1",
        selectedOption: "A",
        responseTimeMs: 500,
      }),
    ).rejects.toThrow("Question closed");
  });

  it("ranks standings: points, then correct, then avg time", async () => {
    const repo = createInMemoryQualifierRepo();
    const q1 = await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_01",
      content: "Q1",
      options: OPTS,
      correctOption: "A",
      position: 1,
    });
    const q2 = await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_02",
      content: "Q2",
      options: OPTS,
      correctOption: "B",
      position: 2,
    });
    // q1: p1 correct, p2 wrong → p1 +1, p2 -1
    await repo.submitAttempt({
      questionId: q1.id,
      playerId: "p1",
      selectedOption: "A",
      responseTimeMs: 3000,
    });
    await repo.submitAttempt({
      questionId: q1.id,
      playerId: "p2",
      selectedOption: "B",
      responseTimeMs: 1000,
    });
    // q2: both correct → +0 each (Y=0)
    await repo.submitAttempt({
      questionId: q2.id,
      playerId: "p1",
      selectedOption: "B",
      responseTimeMs: 1000,
    });
    await repo.submitAttempt({
      questionId: q2.id,
      playerId: "p2",
      selectedOption: "B",
      responseTimeMs: 500,
    });
    await repo.closeAndScore(q1.id, 2);
    await repo.closeAndScore(q2.id, 2);
    const rows = await repo.standings("t1", 16);
    expect(rows.map((r) => r.playerId)).toEqual(["p1", "p2"]);
    expect(rows[0].totalPoints).toBe(1);
    expect(rows[1].totalPoints).toBe(-1);
    expect(rows[0].rank).toBe(1);
  });

  it("blocks edit after close", async () => {
    const repo = createInMemoryQualifierRepo();
    const { id } = await repo.createQuestion({
      tournamentId: "t1",
      questionCode: "VL_01",
      content: "Q",
      options: OPTS,
      correctOption: "A",
      position: 1,
    });
    await repo.closeAndScore(id, 1);
    expect(await repo.updateQuestion(id, { content: "changed" })).toBe(false);
  });
});
