import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useConsoleJudging } from "@/console/model/use-console-judging"

// Về đích grades the open turn's question: the rail's tick set belongs to that
// question, so ticking cards on one question must not carry into the next.
function renderJudging(openIds: string[]) {
    return renderHook(
        ({ ids }: { ids: string[] }) => useConsoleJudging({
            roundId: "ve-dich",
            questions: [],
            openIds: ids,
            answerRows: [],
            send: vi.fn(),
        }),
        { initialProps: { ids: openIds } },
    )
}

describe("useConsoleJudging — the tick set follows the open ve-dich question", () => {
    it("keeps the ticks while the same question stays open", () => {
        const { result, rerender } = renderJudging(["q1"])

        act(() => result.current.toggleSelect("u1"))
        expect([...result.current.selectedIds]).toEqual(["u1"])

        rerender({ ids: ["q1"] })
        expect([...result.current.selectedIds]).toEqual(["u1"])
    })

    it("starts the next question unticked", () => {
        const { result, rerender } = renderJudging(["q1"])

        act(() => result.current.toggleSelect("u1"))
        act(() => result.current.toggleSelect("u2"))
        expect([...result.current.selectedIds]).toEqual(["u1", "u2"])

        rerender({ ids: ["q2"] })
        expect([...result.current.selectedIds]).toEqual([])
    })

    it("grades the open question, not the one that was ticked before", () => {
        const { result, rerender } = renderJudging(["q1"])

        act(() => result.current.toggleSelect("u1"))
        rerender({ ids: ["q2"] })

        act(() => result.current.toggleSelect("u3"))
        expect([...result.current.selectedIds]).toEqual(["u3"])
    })
})
