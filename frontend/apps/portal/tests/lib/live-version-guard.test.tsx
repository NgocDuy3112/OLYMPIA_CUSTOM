import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLive, useLiveAction, type LiveResponse } from "@/lib/live"

const state = vi.hoisted(() => ({ api: vi.fn() }))

vi.mock("@shared/lib/api", () => ({
    api: state.api,
    ApiError: class ApiError extends Error {
        constructor(public status: number, message: string, public code?: string) {
            super(message)
        }
    },
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

    pushConsole(view: LiveResponse) {
        this.push({
            target: "message",
            arguments: [{ type: "console", at: "2026-01-01T00:00:00.000Z", data: { view } }],
        })
    }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]
const liveKey = ["live", "t1", "m1"] as const

function viewOf(version: number, roundId = "khoi-dong"): LiveResponse {
    return { version, roundId } as LiveResponse
}

function setup(cached: LiveResponse | undefined) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    if (cached) client.setQueryData(liveKey, cached)
    const invalidate = vi.spyOn(client, "invalidateQueries")
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(() => ({ live: useLive("t1", "m1"), action: useLiveAction("t1", "m1") }), {
        wrapper,
    })
    act(() => {
        last().open()
        last().push({})
    })
    return {
        ...hook,
        client,
        invalidate,
        cached: () => client.getQueryData<LiveResponse>(liveKey),
        push: (view: LiveResponse) => act(() => last().pushConsole(view)),
    }
}

beforeEach(() => {
    FakeSocket.all = []
    state.api.mockReset()
    state.api.mockImplementation((path: string) =>
        path.endsWith("/live/actions") ? Promise.resolve(undefined) : new Promise(() => {})
    )
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("useLive — a console frame never paints over a newer cached view", () => {
    it("drops a frame whose version is behind the cache", () => {
        const live = setup(viewOf(5, "giai-ma"))
        live.push(viewOf(4, "ve-dich"))
        expect(live.cached()?.version).toBe(5)
        expect(live.cached()?.roundId).toBe("giai-ma")
        live.unmount()
    })

    it("paints a frame newer than the cache", () => {
        const live = setup(viewOf(5, "giai-ma"))
        live.push(viewOf(6, "khoi-dong"))
        expect(live.cached()?.version).toBe(6)
        expect(live.cached()?.roundId).toBe("khoi-dong")
        live.unmount()
    })
})

describe("useLiveAction — the stream frame is the source of truth on success", () => {
    it("does not refetch the live payload after a successful action", async () => {
        const live = setup(viewOf(5))
        live.invalidate.mockClear()

        act(() => {
            live.result.current.action.mutate({ kind: "khoi-dong.start" } as never)
        })

        await waitFor(() => expect(live.result.current.action.isSuccess).toBe(true))
        expect(live.invalidate).not.toHaveBeenCalled()
        live.unmount()
    })

    it("resyncs the live payload when the action fails", async () => {
        const live = setup(viewOf(5))
        state.api.mockRejectedValue(new Error("boom"))
        live.invalidate.mockClear()

        act(() => {
            live.result.current.action.mutate({ kind: "khoi-dong.start" } as never)
        })

        await waitFor(() => expect(live.result.current.action.isError).toBe(true))
        expect(live.invalidate).toHaveBeenCalledWith({ queryKey: ["live"] })
        live.unmount()
    })
})
