import { describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import {
    URGENT_BELOW_MS,
    formatRemaining,
    isUrgent,
    remainingOf,
    skewOf,
    useCountdownMs,
} from "@shared/lib/clock"


describe("skewOf", () => {
    it("is server minus client, in ms", () => {
        expect(skewOf("2026-01-01T00:00:01.000Z", Date.parse("2026-01-01T00:00:00.900Z"))).toBe(100)
        expect(skewOf("2026-01-01T00:00:00.000Z", Date.parse("2026-01-01T00:00:05.000Z"))).toBe(-5000)
    })

    it("a garbage timestamp is a zero skew, not NaN leaking downstream", () => {
        expect(skewOf("not a date", 123)).toBe(0)
    })
})

describe("remainingOf", () => {
    const deadline = "2026-01-01T00:01:00.000Z"   
    const clientNow = Date.parse("2026-01-01T00:00:30.000Z")

    it("counts down against the skew-corrected clock", () => {
        expect(remainingOf(deadline, 0, clientNow)).toBe(30_000)
        expect(remainingOf(deadline, 2_000, clientNow)).toBe(28_000)
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
        expect(formatRemaining(1)).toBe("0:01")     
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
        expect(isUrgent(0)).toBe(false)   
    })
})

describe("useCountdownMs — a duration with no deadline", () => {
    it("ticks down each second and floors at zero", () => {
        vi.useFakeTimers()
        try {
            const { result } = renderHook(() => useCountdownMs(40_000, "q1"))
            expect(result.current).toBe(40_000)

            act(() => vi.advanceTimersByTime(2_000))
            expect(result.current).toBe(38_000)

            act(() => vi.advanceTimersByTime(60_000))
            expect(result.current).toBe(0)
        } finally {
            vi.useRealTimers()
        }
    })

    it("stays null while there is no duration to count", () => {
        const { result } = renderHook(() => useCountdownMs(null, "q1"))
        expect(result.current).toBeNull()
    })

    it("restarts from the fresh duration when the key changes", () => {
        vi.useFakeTimers()
        try {
            const { result, rerender } = renderHook(
                ({ ms, key }) => useCountdownMs(ms, key),
                { initialProps: { ms: 40_000 as number | null, key: "q1" as unknown } }
            )
            act(() => vi.advanceTimersByTime(3_000))
            expect(result.current).toBe(37_000)

            rerender({ ms: 30_000, key: "q2" })
            expect(result.current).toBe(30_000)
        } finally {
            vi.useRealTimers()
        }
    })
})
