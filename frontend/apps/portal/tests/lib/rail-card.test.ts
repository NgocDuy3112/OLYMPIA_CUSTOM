import { describe, expect, it } from "vitest"
import { railCardClass, railCardState, railScoreClass } from "@shared/deck/rail-card"


describe("railCardState", () => {
    it("locked-out looks grey, no hue", () => {
        expect(railCardState({ locked: true })).toBe("wrong")
        expect(railCardClass("wrong")).toContain("bg-muted")
        expect(railCardClass("wrong")).toContain("opacity-70")
        expect(railScoreClass("wrong")).toContain("muted")
    })

    it("the live answerer is purple with a DASHED WHITE outline", () => {
        expect(railCardState({ buzzing: true })).toBe("buzzing")
        expect(railCardClass("buzzing")).toContain("bg-primary")
        expect(railCardClass("buzzing")).toContain("outline-dashed")
        expect(railCardClass("buzzing")).toContain("outline-white")
    })

    it("locked beats the buzz — the seat is out either way", () => {
        expect(railCardState({ buzzing: true, locked: true })).toBe("wrong")
    })

    it("everything else waits: the card is purple too, only tinted", () => {
        expect(railCardState({})).toBe("waiting")
        expect(railCardClass("waiting")).toContain("bg-primary/10")
        expect(railCardClass("waiting")).toContain("ring-border")
        expect(railCardClass("waiting")).not.toContain("outline-dashed")
        expect(railCardClass("buzzing")).toContain("bg-primary ")
    })
})
