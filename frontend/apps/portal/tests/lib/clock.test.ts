import { describe, expect, it } from "vitest"
import {
    URGENT_BELOW_MS,
    formatRemaining,
    isUrgent,
    remainingOf,
    skewOf,
} from "@shared/lib/clock"

// Server time on a client screen: skew from an envelope, then a clamped
// countdown. Every function takes `now` — time is pinned here, never real.

describe("skewOf", () => {
    it("is server minus client, in ms", () => {
        expect(skewOf("2026-01-01T00:00:01.000Z", Date.parse("2026-01-01T00:00:00.900Z"))).toBe(100)
        // a client running AHEAD of the server skews negative
        expect(skewOf("2026-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:00:05.000Z"))).toBe(-5000)
    })

    it("a garbage timestamp is a zero skew, not NaN leaking downstream", () => {
        expect(skewOf("not a date", 123)).toBe(0)
    })
})

describe("remainingOf", () => {
    const deadline = "2026-01-01T00:01:00.000Z"   // T+60s
    const clientNow = Date.parse("2026-01-01T00:00:30.000Z")

    it("counts down against the skew-corrected clock", () => {
        expect(remainingOf(deadline, 0, clientNow)).toBe(30_000)
        // The server is 2 s ahead of this client: what the client sees as 30 s
        // left is really 28 s left on the server's clock.
        expect(remainingOf(deadline, 2_000, clientNow)).toBe(28_000)
        // A client 2 s behind gets the honest 32 s.
        expect(remainingOf(deadline, -2_000, clientNow)).toBe(32_000)
    })

    it("pins at zero — expired, null and invalid never go negative", () => {
        expect(remainingOf(deadline, 0, Date.parse("2026-01-01T00:02:00.000Z"))).toBe(0)
        expect(remainingOf(null, 0, clientNow)).toBe(0)
        expect(remainingOf("garbage", 0, clientNow)).toBe(0)
        expect(remainingOf(deadline, 9_999_999, clientNow)).toBe(0)
    })
})

describe("formatRemaining", () => {
    it("renders m:ss with a live second always visible", () => {
        expect(formatRemaining(30_000)).toBe("0:30")
        expect(formatRemaining(65_000)).toBe("1:05")
        expect(formatRemaining(1)).toBe("0:01")     // ceil: 1 ms still shows a second
        expect(formatRemaining(3_600_000)).toBe("60:00")
    })

    it("expired reads 0:00, never a negative or a blank", () => {
        expect(formatRemaining(0)).toBe("0:00")
        expect(formatRemaining(-9_999)).toBe("0:00")
    })
})

describe("isUrgent", () => {
    it("is true only inside the final window, and never for an expired clock", () => {
        expect(isUrgent(URGENT_BELOW_MS)).toBe(true)
        expect(isUrgent(URGENT_BELOW_MS + 1)).toBe(false)
        expect(isUrgent(1)).toBe(true)
        expect(isUrgent(0)).toBe(false)   // expired is its own state, not urgency
    })
})
