import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useConsoleAssistant } from "@/console/model/use-console-assistant"

describe("useConsoleAssistant — only what the assistant frames carry", () => {
    it("starts with an empty surface", () => {
        const { result } = renderHook(() => useConsoleAssistant())
        expect(result.current.transcript).toEqual([])
        expect(result.current.proposals).toEqual([])
        expect(result.current.error).toBeNull()
    })

    it("appends deltas to the turn they belong to and marks it done", () => {
        const { result } = renderHook(() => useConsoleAssistant())

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
        const { result } = renderHook(() => useConsoleAssistant())
        const action = { kind: "khoi-dong.start", phase: 1 } as const

        act(() =>
            result.current.ingest({
                ok: true,
                frame: { turnId: "t1", toolCall: { proposalId: "p1", action, rationale: "Mở vòng 1" } },
            })
        )
        act(() =>
            result.current.ingest({
                ok: true,
                frame: { turnId: "t1", toolCall: { proposalId: "p1", action, rationale: "Mở vòng 1" } },
            })
        )

        expect(result.current.proposals).toEqual([
            { proposalId: "p1", action, rationale: "Mở vòng 1" },
        ])
    })
})
