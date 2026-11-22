import { describe, expect, it } from "vitest"
import { railCardClass, railCardState, railScoreClass } from "@shared/deck/rail-card"


describe("railCardState", () => {
    it("locked-out looks grey, no hue", () => {
        expect(railCardState({ locked: true })).toBe("wrong")
        expect(railCardClass("wrong")).toContain("bg-[#101116]")
        expect(railCardClass("wrong")).toContain("text-muted-foreground")
        expect(railScoreClass("wrong")).toContain("muted")
    })

    it("the buzzed seat has the same THICK WHITE ring as a picked card", () => {
        expect(railCardState({ buzzing: true })).toBe("buzzing")
        expect(railCardClass("buzzing")).toContain("ring-4")
        expect(railCardClass("buzzing")).toContain("ring-white")
        expect(railCardClass("buzzing")).toBe(railCardClass("picked"))
    })

    it("locked beats the buzz — the seat is out either way", () => {
        expect(railCardState({ buzzing: true, locked: true })).toBe("wrong")
    })

    it("everything else waits: dark tint, no outline", () => {
        expect(railCardState({})).toBe("waiting")
        expect(railCardClass("waiting")).toContain("bg-[#16181e]")
        expect(railCardClass("waiting")).toContain("ring-white/10")
        expect(railCardClass("waiting")).not.toContain("outline-dashed")
        expect(railCardClass("buzzing")).toContain("bg-[#3a4150]")
    })
})
