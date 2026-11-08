import { describe, expect, it } from "vitest"
import { railCardClass, railCardState, railScoreClass } from "@shared/deck/rail-card"


describe("railCardState", () => {
    it("a judged CORRECT card is the bright one", () => {
        expect(railCardState({ verdict: "CORRECT" })).toBe("correct")
        expect(railCardClass("correct")).toContain("bg-emerald-50")
        expect(railCardClass("correct")).toContain("ring-emerald-500")
        expect(railScoreClass("correct")).toContain("emerald")
    })

    it("wrong and locked-out look the same: grey, no hue", () => {
        expect(railCardState({ verdict: "INCORRECT" })).toBe("wrong")
        expect(railCardState({ locked: true })).toBe("wrong")
        expect(railCardClass("wrong")).toContain("bg-muted")
        expect(railCardClass("wrong")).toContain("opacity-70")
    })

    it("the live answerer is purple with a DASHED WHITE outline", () => {
        expect(railCardState({ buzzing: true })).toBe("buzzing")
        expect(railCardClass("buzzing")).toContain("bg-primary")
        expect(railCardClass("buzzing")).toContain("outline-dashed")
        expect(railCardClass("buzzing")).toContain("outline-white")
    })

    it("a verdict beats the buzz — once judged, the outcome is what the card says", () => {
        expect(railCardState({ buzzing: true, verdict: "CORRECT" })).toBe("correct")
        expect(railCardState({ buzzing: true, locked: true })).toBe("wrong")
    })

    it("everything else waits: the card is purple too, only tinted", () => {
        expect(railCardState({})).toBe("waiting")
        expect(railCardClass("waiting")).toContain("bg-primary/10")
        expect(railCardClass("waiting")).not.toContain("outline-dashed")
        expect(railCardClass("buzzing")).toContain("bg-primary ")
    })
})
