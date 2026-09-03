import { describe, expect, it } from "vitest";

import {
  canTransitionStatus,
  STATUS_TRANSITIONS,
} from "../../src/base/lifecycle.js";
import type { MatchStatus } from "../../src/types.js";

describe("canTransitionStatus", () => {
  const validCases: Array<[MatchStatus, MatchStatus]> = [
    ["setup", "active"],
    ["active", "in_progress"],
    ["active", "paused"],
    ["in_progress", "paused"],
    ["in_progress", "completed"],
    ["paused", "in_progress"],
    ["paused", "active"],
    ["completed", "finished"],
  ];

  it.each(validCases)("allows %s → %s", (current, next) => {
    expect(canTransitionStatus(current, next)).toBe(true);
  });

  const invalidCases: Array<[MatchStatus, MatchStatus]> = [
    ["setup", "completed"],
    ["setup", "paused"],
    ["active", "completed"],
    ["paused", "completed"],
    ["completed", "active"],
    ["finished", "active"],
  ];

  it.each(invalidCases)("rejects %s → %s", (current, next) => {
    expect(canTransitionStatus(current, next)).toBe(false);
  });

  it("finished is terminal — no transitions defined", () => {
    expect(STATUS_TRANSITIONS.finished).toEqual([]);
  });
});
