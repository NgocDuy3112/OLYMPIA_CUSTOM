import { describe, expect, it } from "vitest"
import { flashOf, refusalOf } from "@/lib/flash"

// The refusal line. A rejected write is normal play (the window moved on), so
// the deck has to say it in a slot — never crash, never go silent. Two rows
// matter: which error wins, and what a non-Error rejection reads as.

describe("refusalOf", () => {
    it("passes a transport error's message through", () => {
        expect(refusalOf(new Error("Vòng đã đóng"))).toBe("Vòng đã đóng")
    })

    it("says nothing when the mutation did not fail", () => {
        expect(refusalOf(null)).toBeNull()
        expect(refusalOf(undefined)).toBeNull()
    })

    it("has a line for a rejection that is not an Error", () => {
        expect(refusalOf("409")).toBe("Không gửi được — thử lại")
        expect(refusalOf({ status: 409 })).toBe("Không gửi được — thử lại")
    })
})

describe("flashOf — one line, in priority order", () => {
    it("says nothing when every mutation is clean", () => {
        expect(flashOf(null, null, null)).toBeNull()
        expect(flashOf()).toBeNull()
    })

    it("reports the first refusal that exists", () => {
        expect(flashOf(null, new Error("hết giờ"), new Error("khác"))).toBe("hết giờ")
    })

    it("keeps the control order when several failed", () => {
        expect(flashOf(new Error("nộp bài"), new Error("từ khoá"))).toBe("nộp bài")
    })
})
