import { describe, expect, it } from "vitest";

import {
  answersMatch,
  isCorrectOption,
  normalizeAnswer,
} from "../../src/base/validation.js";

describe("normalizeAnswer", () => {
  it("trims and lowercases", () => {
    expect(normalizeAnswer("  Ha Noi  ")).toBe("ha noi");
  });

  it("collapses internal whitespace", () => {
    expect(normalizeAnswer("a   b\t c")).toBe("a b c");
  });

  it("keeps non-latin characters intact", () => {
    expect(normalizeAnswer("  ĐÀ NẴNG  ")).toBe("đà nẵng");
  });
});

describe("answersMatch", () => {
  it("matches case-insensitively with trimming", () => {
    expect(answersMatch(" Paris ", "paris")).toBe(true);
  });

  it("matches with different internal spacing", () => {
    expect(answersMatch("new   york", "New York")).toBe(true);
  });

  it("rejects different answers", () => {
    expect(answersMatch("hanoi", "saigon")).toBe(false);
  });
});

describe("isCorrectOption", () => {
  it("matches MCQ option case-insensitively", () => {
    expect(isCorrectOption("b", "B")).toBe(true);
    expect(isCorrectOption(" A ", "a")).toBe(true);
  });

  it("rejects wrong option", () => {
    expect(isCorrectOption("A", "B")).toBe(false);
  });
});
