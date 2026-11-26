import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLive } from "@/lib/live"
import { useConsoleAssistant } from "@/console/model/use-console-assistant"

const state = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@shared/lib/api", () => ({
    api: state.api,
    ApiError: class ApiError extends Error {},
}))

class FakeSocket {
    static all: FakeSocket[] = []
    static OPEN = 1
    readyState = 0
    sent: string[] = []
    onopen: ((event: Event) => void) | null = null
    onmessage: ((event: MessageEvent) => void) | null = null
    onclose: ((event: CloseEvent) => void) | null = null

    constructor(public url: string) {
        FakeSocket.all.push(this)
    }

    send(data: string) {
        this.sent.push(data)
    }

    close() {
        if (this.readyState === 3) return
        this.readyState = 3
        this.onclose?.({ code: 1000 } as CloseEvent)
    }

    open() {
        this.readyState = FakeSocket.OPEN
        this.onopen?.(new Event("open"))
    }

    push(payload: unknown) {
        this.onmessage?.({ data: `${JSON.stringify(payload)}\u001e` } as MessageEvent)
    }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]

function assistantFrame(data: unknown) {
    return { target: "message", arguments: [{ type: "assistant", data }] }
}

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(
        () => {
            const assistant = useConsoleAssistant(vi.fn())
            useLive("t1", "m1", undefined, assistant.ingest)
            return assistant
        },
        { wrapper }
    )
    act(() => {
        last().open()
        last().push({})
    })
    return {
        ...hook,
        push: (data: unknown) => act(() => last().push(assistantFrame(data))),
    }
}

beforeEach(() => {
    FakeSocket.all = []
    state.api.mockReset()
    state.api.mockImplementation(() => new Promise(() => {}))
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("the live stream routes assistant frames into the console assistant", () => {
    it("feeds a delta and its done marker into the transcript", () => {
        const live = setup()

        live.push({ turnId: "t1", delta: "Đã mở vòng" })
        live.push({ turnId: "t1", done: true })

        expect(live.result.current.transcript).toEqual([
            { turnId: "t1", text: "Đã mở vòng", done: true },
        ])
        live.unmount()
    })

    it("feeds a tool call in as a proposal, on the one socket already open", () => {
        const live = setup()
        const action = { kind: "khoi-dong.start", phase: 1 }

        live.push({ turnId: "t1", toolCall: { proposalId: "p1", action, rationale: "Mở vòng 1" } })

        expect(live.result.current.proposals).toEqual([
            { proposalId: "p1", action, rationale: "Mở vòng 1" },
        ])
        expect(FakeSocket.all).toHaveLength(1)
        live.unmount()
    })

    it("turns a malformed assistant payload into a typed error, not a crash", () => {
        const live = setup()

        expect(() => live.push({ turnId: "t1" })).not.toThrow()

        expect(live.result.current.error).toBe("Khung assistant không có nội dung")
        expect(live.result.current.transcript).toEqual([])
        expect(live.result.current.proposals).toEqual([])
        live.unmount()
    })
})
