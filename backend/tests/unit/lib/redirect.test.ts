import { describe, expect, it } from "vitest";
import { safeNextPath } from "../../../src/lib/redirect.js";

// The ?next= value is user-controlled: a sign-in link must never be able to
// bounce a player to another origin.

describe("safeNextPath", () => {
    it("keeps a site-relative path", () => {
        expect(safeNextPath("/s/olympia-2026/matches/42")).toBe("/s/olympia-2026/matches/42");
        expect(safeNextPath("/")).toBe("/");
        expect(safeNextPath("/standings?tab=day")).toBe("/standings?tab=day");
    });

    it("rejects an origin", () => {
        expect(safeNextPath("https://evil.example")).toBe("/");
        expect(safeNextPath("http://evil.example")).toBe("/");
        expect(safeNextPath("javascript:alert(1)")).toBe("/");
    });

    it("rejects protocol-relative — //host and its backslash twin", () => {
        expect(safeNextPath("//evil.example")).toBe("/");
        expect(safeNextPath("/\\evil.example")).toBe("/");
        expect(safeNextPath("/\\/evil.example")).toBe("/");
    });

    it("rejects control characters that could split a Location header", () => {
        expect(safeNextPath("/a\r\nSet-Cookie: x=1")).toBe("/");
        expect(safeNextPath("/a\tb")).toBe("/");
        expect(safeNextPath("/a\u0000b")).toBe("/");
    });

    it("falls back for anything that is not a string", () => {
        expect(safeNextPath(undefined)).toBe("/");
        expect(safeNextPath(null)).toBe("/");
        expect(safeNextPath(42)).toBe("/");
        expect(safeNextPath({ next: "/x" })).toBe("/");
        expect(safeNextPath("")).toBe("/");
    });
});
