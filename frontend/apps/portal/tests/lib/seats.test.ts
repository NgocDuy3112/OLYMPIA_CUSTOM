import { describe, expect, it } from "vitest"
import { allowedSeatsOf, seatsPhrase } from "@/lib/tournaments"

// AOC: a group match holds 3 or 4 players, and the team-point scale resolves by
// the real count. The format decides what the New-match dialog may offer.

describe("allowedSeatsOf — what a match of this tournament may hold", () => {
    it("uses the explicit set when the format names one", () => {
        expect(allowedSeatsOf({ competitorsPerMatch: 4, allowedCompetitorCounts: [3, 4] })).toEqual([3, 4])
    })

    it("falls back to the fixed size when the format says nothing", () => {
        expect(allowedSeatsOf({ competitorsPerMatch: 3 })).toEqual([3])
    })

    it("treats an empty set as 'the fixed size', not as 'no seats'", () => {
        expect(allowedSeatsOf({ competitorsPerMatch: 4, allowedCompetitorCounts: [] })).toEqual([4])
    })
})

describe("seatsPhrase — the copy never invents a list", () => {
    it("says '3 or 4'", () => {
        expect(seatsPhrase([3, 4])).toBe("3 or 4")
    })

    it("says a bare number when there is one option", () => {
        expect(seatsPhrase([4])).toBe("4")
    })

    it("joins three with commas and a final 'or'", () => {
        expect(seatsPhrase([3, 4, 5])).toBe("3, 4 or 5")
    })
})
