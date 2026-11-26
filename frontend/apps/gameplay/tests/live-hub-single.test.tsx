import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLiveMatch, useTieBreakMatch } from "@/lib/live"
import { LiveHubProvider } from "@/components/live-hub-provider"

vi.mock("@shared/lib/api", () => ({
    api: vi.fn(() => new Promise(() => {})),
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

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <LiveHubProvider matchId="m1" enabled>{children}</LiveHubProvider>
        </QueryClientProvider>
    )
    return renderHook(() => ({
        deck: useLiveMatch("m1", true),
        tie: useTieBreakMatch("m1", true),
    }), { wrapper })
}

beforeEach(() => {
    FakeSocket.all = []
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("the match hub — one socket per match", () => {
    it("the deck and the tie-break share a single connection", () => {
        const hook = setup()
        expect(FakeSocket.all).toHaveLength(1)
        hook.unmount()
    })

    it("the tie-break buzz leaves on that shared connection", async () => {
        const hook = setup()
        act(() => {
            last().open()
            last().push({})
        })

        await act(async () => {
            hook.result.current.tie.buzz.mutate("q1")
        })

        expect(last().sent.some((frame) => frame.includes("\"Buzz\""))).toBe(true)
        hook.unmount()
    })
})
