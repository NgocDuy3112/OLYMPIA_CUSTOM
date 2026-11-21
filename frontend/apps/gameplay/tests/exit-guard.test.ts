import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useExitGuard } from "@shared/lib/exit-guard"

function unload(): boolean {
    const event = new Event("beforeunload", { cancelable: true }) as BeforeUnloadEvent
    window.dispatchEvent(event)
    return event.defaultPrevented
}

describe("useExitGuard — leaving a live round asks first", () => {
    it("does not prompt while idle", () => {
        renderHook(() => useExitGuard(false, "cẩn thận"))
        expect(unload()).toBe(false)
    })

    it("prompts while a round is running", () => {
        renderHook(() => useExitGuard(true, "cẩn thận"))
        expect(unload()).toBe(true)
    })

    it("stops prompting once the round ends", () => {
        const { rerender } = renderHook(({ active }) => useExitGuard(active, "cẩn thận"), {
            initialProps: { active: true },
        })
        act(() => rerender({ active: false }))
        expect(unload()).toBe(false)
    })
})
