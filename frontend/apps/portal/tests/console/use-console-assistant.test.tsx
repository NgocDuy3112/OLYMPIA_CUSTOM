import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useConsoleAssistant } from "@/console/model/use-console-assistant"
import type { LiveAction } from "@/lib/live-actions"

const startAction: LiveAction = { kind: "khoi-dong.start", phase: 1 }

function ingestProposal(
    ingest: ReturnType<typeof useConsoleAssistant>["ingest"],
    proposalId = "p1",
    action: LiveAction = startAction
) {
    act(() =>
        ingest({
            ok: true,
            frame: { turnId: "t1", toolCall: { proposalId, action, rationale: "Mở vòng 1" } },
        })
    )
}

describe("useConsoleAssistant — only what the assistant frames carry", () => {
    it("starts with an empty surface", () => {
        const { result } = renderHook(() => useConsoleAssistant(vi.fn()))
        expect(result.current.transcript).toEqual([])
        expect(result.current.proposals).toEqual([])
        expect(result.current.decisions).toEqual([])
        expect(result.current.error).toBeNull()
    })

    it("appends deltas to the turn they belong to and marks it done", () => {
        const { result } = renderHook(() => useConsoleAssistant(vi.fn()))

        act(() => result.current.ingest({ ok: true, frame: { turnId: "t1", delta: "Chào" } }))
        act(() => result.current.ingest({ ok: true, frame: { turnId: "t1", delta: " sân khấu" } }))
        act(() => result.current.ingest({ ok: true, frame: { turnId: "t2", delta: "Vòng 2" } }))
        act(() => result.current.ingest({ ok: true, frame: { turnId: "t1", done: true } }))

        expect(result.current.transcript).toEqual([
            { turnId: "t1", text: "Chào sân khấu", done: true },
            { turnId: "t2", text: "Vòng 2", done: false },
        ])
    })

    it("keeps a tool call as a proposal without any system action", () => {
        const send = vi.fn()
        const { result } = renderHook(() => useConsoleAssistant(send))

        ingestProposal(result.current.ingest)
        ingestProposal(result.current.ingest)

        expect(result.current.proposals).toEqual([
            { proposalId: "p1", action: startAction, rationale: "Mở vòng 1" },
        ])
        expect(send).not.toHaveBeenCalled()
    })
})

describe("useConsoleAssistant — a proposal only reaches the game through the existing send", () => {
    it("applies a proposal by dispatching the very same action object through the sender", () => {
        const send = vi.fn()
        const { result } = renderHook(() => useConsoleAssistant(send))
        const action: LiveAction = { kind: "khoi-dong.judge", playerId: "u1", correct: true }

        ingestProposal(result.current.ingest, "p9", action)
        act(() => result.current.apply("p9"))

        expect(send).toHaveBeenCalledTimes(1)
        expect(send.mock.calls[0][0]).toBe(action)
        expect(result.current.proposals).toEqual([])
        expect(result.current.decisions).toEqual([
            { proposalId: "p9", action, outcome: "applied" },
        ])
    })

    it("dismisses a proposal without touching the game", () => {
        const send = vi.fn()
        const { result } = renderHook(() => useConsoleAssistant(send))

        ingestProposal(result.current.ingest, "p9")
        act(() => result.current.dismiss("p9"))

        expect(send).not.toHaveBeenCalled()
        expect(result.current.proposals).toEqual([])
        expect(result.current.decisions).toEqual([
            { proposalId: "p9", action: startAction, outcome: "dismissed" },
        ])
    })

    it("applies a proposal once, even when the button is pressed again", () => {
        const send = vi.fn()
        const { result } = renderHook(() => useConsoleAssistant(send))

        ingestProposal(result.current.ingest, "p9")
        act(() => result.current.apply("p9"))
        act(() => result.current.apply("p9"))

        expect(send).toHaveBeenCalledTimes(1)
    })
})
