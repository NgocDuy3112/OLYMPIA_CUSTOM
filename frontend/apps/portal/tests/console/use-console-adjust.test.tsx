import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useConsoleAdjust } from "@/console/model/use-console-adjust"
import type { Projection } from "@shared/wire/live"

function projection(points: number, awarded: number | null): Projection {
    return {
        table: [{ id: "u1", displayName: "An", points, rank: 1 }],
        answers: [{ questionId: "q1", userId: "u1", value: null, verdict: null, pointsAwarded: awarded }],
    } as unknown as Projection
}

const stillPending = () => new Promise<void>(() => {})

describe("useConsoleAdjust — the dialog waits for the frame", () => {
    it("keeps the score dialog pending until the frame carries the new points", () => {
        const sendScore = vi.fn(stillPending)
        const before = projection(10, 0)
        const { result, rerender } = renderHook(
            ({ data }) => useConsoleAdjust({ sendScore, projection: data }),
            { initialProps: { data: before } }
        )

        act(() => result.current.openAdjust("u1"))
        act(() => result.current.submitAdjust(5, "chấm lại"))

        expect(sendScore).toHaveBeenCalledWith({ kind: "score.adjust", userId: "u1", delta: 5, reason: "chấm lại" })
        expect(result.current.adjustPending).toBe(true)
        expect(result.current.adjustFor).toBe("u1")

        rerender({ data: projection(15, 0) })

        expect(result.current.adjustPending).toBe(false)
        expect(result.current.adjustFor).toBeNull()
    })

    it("keeps the regrade dialog open with the reason the action was refused", async () => {
        const sendScore = vi.fn(async () => {
            throw new Error("Điểm vượt giới hạn")
        })
        const { result } = renderHook(() =>
            useConsoleAdjust({ sendScore, projection: projection(10, 0) })
        )

        act(() => result.current.openRegrade("u1"))
        act(() => result.current.submitRegrade("q1", -5))

        await waitFor(() => expect(result.current.regradeError).toBe("Điểm vượt giới hạn"))
        expect(result.current.regradePending).toBe(false)
        expect(result.current.regradeFor).toBe("u1")
    })

    it("waits for the regraded points, not just the ack", () => {
        const sendScore = vi.fn(stillPending)
        const { result, rerender } = renderHook(
            ({ data }) => useConsoleAdjust({ sendScore, projection: data }),
            { initialProps: { data: projection(10, 0) } }
        )

        act(() => result.current.openRegrade("u1"))
        act(() => result.current.submitRegrade("q1", 5))
        expect(result.current.regradePending).toBe(true)

        rerender({ data: projection(10, 5) })

        expect(result.current.regradePending).toBe(false)
        expect(result.current.regradeFor).toBeNull()
    })
})
