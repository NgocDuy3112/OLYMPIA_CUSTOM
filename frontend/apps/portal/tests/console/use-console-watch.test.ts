import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useConsoleWatch } from "@/console/model/use-console-watch"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("the stage stopwatch (TÍNH GIỜ)", () => {
    it("counts down live once pressed: 40 → 39 → 38 in whole seconds", () => {
        const { result } = renderHook(() => useConsoleWatch("q1"))
        expect(result.current.running).toBe(false)

        act(() => result.current.toggle())
        expect(result.current.running).toBe(true)

        act(() => vi.advanceTimersByTime(1_000))
        expect(result.current.ms).toBeGreaterThanOrEqual(1_000)
        act(() => vi.advanceTimersByTime(1_000))
        expect(result.current.ms).toBeGreaterThanOrEqual(2_000)
    })

    it("a press made while NO question is engaged adopts the question — it must not die", () => {
        const { result, rerender } = renderHook(({ qid }) => useConsoleWatch(qid), {
            initialProps: { qid: null as string | null },
        })

        act(() => result.current.toggle())
        expect(result.current.running).toBe(true)

        rerender({ qid: "q1" })
        expect(result.current.running).toBe(true)
        act(() => vi.advanceTimersByTime(1_000))
        expect(result.current.ms).toBeGreaterThanOrEqual(1_000)
    })

    it("a verdict (real question change) stops and clears it — the seconds were banked", () => {
        const { result, rerender } = renderHook(({ qid }) => useConsoleWatch(qid), {
            initialProps: { qid: "q1" as string | null },
        })
        act(() => result.current.toggle())
        act(() => vi.advanceTimersByTime(2_000))

        rerender({ qid: "q2" })
        expect(result.current.running).toBe(false)
        expect(result.current.ms).toBe(0)
    })

    it("pauses on the second press, keeping what it counted", () => {
        const { result } = renderHook(() => useConsoleWatch("q1"))
        act(() => result.current.toggle())
        act(() => vi.advanceTimersByTime(3_000))
        act(() => result.current.toggle())

        expect(result.current.running).toBe(false)
        expect(result.current.ms).toBeGreaterThanOrEqual(3_000)
        act(() => vi.advanceTimersByTime(5_000))
        expect(result.current.ms).toBeLessThan(4_000)
    })
})
