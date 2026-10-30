import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderHook } from "@testing-library/react"
import type { ReactNode } from "react"

import { useQuestionAnswers } from "@/lib/live"

// The MC's ledger is the judging panel's raw material: a player's submission
// bumps no live version and pushes no frame, so the ONLY signal is this poll.
// (A reload used to be the only way Đúng could arm — smoke run 2026-10-29.)

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 0, refetchOnWindowFocus: false } },
    })
    return ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
}

function stubLedger() {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
        calls.push(String(input))
        return { ok: true, status: 200, statusText: "", json: async () => ({ items: [] }) } as Response
    }))
    return calls
}

describe("useQuestionAnswers — the judging ledger polls", () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
        vi.unstubAllGlobals()
    })

    it("refetches on the 3s interval while a question is open", async () => {
        const calls = stubLedger()
        renderHook(() => useQuestionAnswers("t1", "m1", "q1"), { wrapper: makeWrapper() })

        await vi.advanceTimersByTimeAsync(0)
        expect(calls).toHaveLength(1)

        await vi.advanceTimersByTimeAsync(3_100)
        expect(calls).toHaveLength(2)

        await vi.advanceTimersByTimeAsync(3_100)
        expect(calls).toHaveLength(3)
    })

    it("never polls without an open question — no question, no traffic", async () => {
        const calls = stubLedger()
        renderHook(() => useQuestionAnswers("t1", "m1", null), { wrapper: makeWrapper() })

        await vi.advanceTimersByTimeAsync(10_000)
        expect(calls).toHaveLength(0)
    })
})
