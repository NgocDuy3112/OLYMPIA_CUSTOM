import { describe, expect, it } from "vitest";
import {
  expectedSlotCount,
  missingSlots,
  roundOfSlot,
  slotsForRound,
  totalExpectedSlots,
} from "../src/modules/question-set/slots.js";

describe("question-set slots template", () => {
  it("counts slots per round (6/24/9/4/24 = 67)", () => {
    expect(expectedSlotCount("KD_C")).toBe(6);
    expect(expectedSlotCount("KD_R")).toBe(24);
    expect(expectedSlotCount("GM")).toBe(9);
    expect(expectedSlotCount("BP")).toBe(4);
    expect(expectedSlotCount("VD")).toBe(24);
    expect(totalExpectedSlots()).toBe(67);
  });

  it("detects round from slot code", () => {
    expect(roundOfSlot("KDC_1")).toBe("KD_C");
    expect(roundOfSlot("KDR4_6")).toBe("KD_R");
    expect(roundOfSlot("GM_KEY")).toBe("GM");
    expect(roundOfSlot("GM_H8")).toBe("GM");
    expect(roundOfSlot("BP_4")).toBe("BP");
    expect(roundOfSlot("VD_THTH_20")).toBe("VD");
    expect(roundOfSlot("NOPE")).toBeNull();
  });

  it("lists missing slots in display order", () => {
    expect(missingSlots("BP", ["BP_1", "BP_3"])).toEqual(["BP_2", "BP_4"]);
    expect(missingSlots("KD_C", slotsForRound("KD_C"))).toEqual([]);
  });
});
