import { describe, expect, it } from "vitest";

import { parseAction } from "../../src/transport/action-parser.js";

describe("parseAction", () => {
  it("parses a valid action", () => {
    const action = parseAction({
      type: "answer",
      user_code: "P1",
      match_code: "M1",
      phase: "kdr",
      payload: "hello",
    });
    expect(action).not.toBeNull();
    expect(action!.type).toBe("answer");
    expect(action!.userCode).toBe("P1");
    expect(action!.matchCode).toBe("M1");
    expect(action!.phase).toBe("kdr");
  });

  it("defaults phase to kdc when missing", () => {
    const action = parseAction({ type: "answer", user_code: "P1" });
    expect(action!.phase).toBe("kdc");
  });

  it("defaults matchCode to empty string when missing", () => {
    const action = parseAction({ type: "answer", user_code: "P1" });
    expect(action!.matchCode).toBe("");
  });

  it("returns null when type missing", () => {
    expect(parseAction({ user_code: "P1" })).toBeNull();
  });

  it("returns null when user_code missing", () => {
    expect(parseAction({ type: "answer" })).toBeNull();
  });

  it("returns null on invalid phase", () => {
    expect(
      parseAction({ type: "answer", user_code: "P1", phase: "bogus" }),
    ).toBeNull();
  });

  it("accepts all OC3 phases", () => {
    for (const phase of ["kdc", "kdr", "bp", "vdc", "vdr", "gm"]) {
      expect(
        parseAction({ type: "answer", user_code: "P1", phase }),
      ).not.toBeNull();
    }
  });

  it("keeps raw payload accessible", () => {
    const action = parseAction({
      type: "answer",
      user_code: "P1",
      extra: 42,
    });
    expect(action!.payload.extra).toBe(42);
  });
});
