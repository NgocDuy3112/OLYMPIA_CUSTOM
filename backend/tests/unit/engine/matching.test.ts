import { describe, expect, it } from "vitest";
import { autoMatch, normalizeText } from "../../../src/game/engine/matching.js";
import type { QuestionPayload } from "../../../src/game/contracts/index.js";

const N = (over: Partial<{ caseSensitive: boolean; trim: boolean; stripAccents: boolean }> = {}) => ({
    caseSensitive: false, trim: true, stripAccents: true, ...over
});

describe("normalizeText", () => {
    it("trims when asked", () => {
        expect(normalizeText("  abc  ", N())).toBe("abc");
    });

    it("is case-insensitive by default in these rules", () => {
        expect(normalizeText("ABC", N())).toBe("abc");
    });

    it("keeps case when caseSensitive", () => {
        expect(normalizeText("ABC", N({ caseSensitive: true }))).toBe("ABC");
    });

    it("strips Vietnamese diacritics, including đ -> d", () => {
        expect(normalizeText("Điện Biên Phủ", N())).toBe("dien bien phu");
        expect(normalizeText("Hà Nội", N())).toBe("ha noi");
    });

    it("can leave diacritics intact", () => {
        expect(normalizeText("Hà Nội", N({ stripAccents: false }))).toBe("hà nội");
    });
});

describe("autoMatch — MC", () => {
    const payload = {
        options: [{ id: "a", text: "A" }, { id: "b", text: "B" }, { id: "c", text: "C" }],
        correctSet: ["a", "c"]
    } as QuestionPayload;

    it("accepts a set regardless of order", () => {
        expect(autoMatch("MC", payload, { picked: ["c", "a"] })).toBe(true);
    });

    it("ignores duplicate picks", () => {
        expect(autoMatch("MC", payload, { picked: ["c", "a", "a"] })).toBe(true);
    });

    it("rejects an incomplete set", () => {
        expect(autoMatch("MC", payload, { picked: ["a"] })).toBe(false);
    });

    it("rejects an extra option", () => {
        expect(autoMatch("MC", payload, { picked: ["a", "b", "c"] })).toBe(false);
    });

    it("rejects an empty submission", () => {
        expect(autoMatch("MC", payload, { picked: [] })).toBe(false);
    });

    it("rejects a text value on an MC question", () => {
        expect(autoMatch("MC", payload, { text: "a,c" })).toBe(false);
    });
});

describe("autoMatch — TEXT", () => {
    const payload = {
        acceptedAnswers: ["Hà Nội"],
        normalize: N()
    } as QuestionPayload;

    it("matches an exact answer", () => {
        expect(autoMatch("TEXT", payload, { text: "Hà Nội" })).toBe(true);
    });

    it("matches ignoring case and accents", () => {
        expect(autoMatch("TEXT", payload, { text: "  ha noi  " })).toBe(true);
    });

    it("rejects a wrong answer", () => {
        expect(autoMatch("TEXT", payload, { text: "Hải Phòng" })).toBe(false);
    });

    it("rejects an empty submission", () => {
        expect(autoMatch("TEXT", payload, { text: "" })).toBe(false);
    });

    it("rejects a picked value on a TEXT question", () => {
        expect(autoMatch("TEXT", payload, { picked: ["Hà Nội"] })).toBe(false);
    });

    it("respects caseSensitive", () => {
        const strict = { acceptedAnswers: ["Ha Noi"], normalize: N({ caseSensitive: true, stripAccents: false }) } as QuestionPayload;
        expect(autoMatch("TEXT", strict, { text: "ha noi" })).toBe(false);
        expect(autoMatch("TEXT", strict, { text: "Ha Noi" })).toBe(true);
    });
});

describe("autoMatch — KEYWORD", () => {
    const payload = {
        code: "Điện Biên Phủ",
        normalize: N()
    } as QuestionPayload;

    it("matches the keyword ignoring case and accents", () => {
        expect(autoMatch("KEYWORD", payload, { text: "dien bien phu" })).toBe(true);
        expect(autoMatch("KEYWORD", payload, { text: "ĐIỆN BIÊN PHỦ" })).toBe(true);
    });

    it("rejects a wrong keyword", () => {
        expect(autoMatch("KEYWORD", payload, { text: "dien bien" })).toBe(false);
    });

    it("rejects an empty submission", () => {
        expect(autoMatch("KEYWORD", payload, { text: "" })).toBe(false);
    });
});
