import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useCopyFeedback } from "@/pages/copy-feedback"

const writeText = vi.fn(async () => {})

beforeEach(() => {
    vi.useFakeTimers()
    writeText.mockClear()
    vi.stubGlobal("navigator", { clipboard: { writeText } })
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("useCopyFeedback", () => {
    it("reports the copy and reverts on its own, so one click is enough", () => {
        const hook = renderHook(() => useCopyFeedback())

        expect(hook.result.current.copied).toBe(false)

        act(() => hook.result.current.copy("aoc_live_secret"))
        expect(writeText).toHaveBeenCalledWith("aoc_live_secret")
        expect(hook.result.current.copied).toBe(true)

        act(() => vi.advanceTimersByTime(1_500))
        expect(hook.result.current.copied).toBe(false)
    })
})
