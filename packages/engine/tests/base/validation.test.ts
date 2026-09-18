import { describe, expect, it } from "vitest";

import {
  answersMatch,
  isCorrectOption,
  mathAnswersEqual,
  normalizeAnswer,
  normalizeMathAnswer,
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

describe("normalizeMathAnswer", () => {
  it("canonicalizes fractions to numbers", () => {
    expect(normalizeMathAnswer("1/2")).toBe("num:0.5");
  });

  it("strips variable left side", () => {
    expect(normalizeMathAnswer("x=2")).toBe("num:2");
  });

  it("handles percent and comma decimals", () => {
    expect(normalizeMathAnswer("50%")).toBe("num:0.5");
    expect(normalizeMathAnswer("3,5")).toBe("num:3.5");
  });
});

describe("mathAnswersEqual", () => {
  it("matches equivalent fractions and decimals", () => {
    expect(mathAnswersEqual("1/2", "0.5")).toBe(true);
    expect(mathAnswersEqual("x=2", "2")).toBe(true);
    expect(mathAnswersEqual("50%", "0.5")).toBe(true);
  });

  it("matches text diacritics-insensitively", () => {
    expect(mathAnswersEqual("Hà Nội", "ha noi")).toBe(true);
  });

  it("rejects different values", () => {
    expect(mathAnswersEqual("1/3", "0.5")).toBe(false);
    expect(mathAnswersEqual("2", "3")).toBe(false);
  });
});
