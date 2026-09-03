import { describe, expect, it } from "vitest";

import { failure, success } from "../../src/core/result.js";

describe("success", () => {
  it("wraps value with empty events and deltas by default", () => {
    const result = success({ foo: 1 });
    expect(result).toEqual({
      ok: true,
      value: { foo: 1 },
      events: [],
      scoreDeltas: [],
    });
  });

  it("carries events and score deltas", () => {
    const result = success("v", [{ type: "phase_changed" }], [
      { userCode: "P1", points: 10, reason: "kdc_correct" },
    ]);
    expect(result.ok && result.events).toHaveLength(1);
    expect(result.ok && result.scoreDeltas[0].points).toBe(10);
  });
});

describe("failure", () => {
  it("carries code and message", () => {
    const result = failure("INVALID_PHASE", "bad phase");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PHASE");
      expect(result.error.message).toBe("bad phase");
    }
  });

  it("carries optional details", () => {
    const result = failure("E", "msg", { phase: "x" });
    if (!result.ok) {
      expect(result.error.details).toEqual({ phase: "x" });
    }
  });
});
