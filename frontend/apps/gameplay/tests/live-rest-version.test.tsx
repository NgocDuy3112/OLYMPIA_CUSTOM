import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLiveMatch, type LiveView } from "@/lib/live"

/**
 * The stream moves the room on; the REST view is the fallback (connect/reconnect,
 * error retry). A slow read that started before a frame can answer *after* it, so
 * the cache must keep the newer of the two instead of repainting the older.
 */
const state = vi.hoisted(() => ({
    reads: [] as LiveView[],
    latest: undefined as LiveView | undefined,
}))

vi.mock("@shared/lib/api", () => ({
    api: vi.fn(async () => {
        const next = state.reads.length > 0 ? state.reads.shift() : state.latest
        state.latest = next
        return next
    }),
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

    /** One live view frame, wrapped the way the hub delivers it. */
    pushView(view: LiveView) {
        this.push({ target: "message", arguments: [{ type: "view", at: "2026-01-01T00:00:00.000Z", data: { view } }] })
    }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]
const liveKey = ["live", "m1"] as const

function readOf(version: number, stage: string): LiveView {
    return {
        matchId: "m1",
        roundId: "ve-dich",
        version,
        stage,
        open: [],
        table: [],
        me: { pickedTiles: [], hintVerdicts: {} },
        hintAnswers: {},
        keywordDeadlineAt: null,
        keywordLength: 0,
        keywordKind: "letters",
    } as LiveView
}

async function setup(initial: LiveView) {
    state.reads = [initial]
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(() => useLiveMatch("m1", true), { wrapper })
    await waitFor(() => expect(hook.result.current.view?.version).toBe(initial.version))
    act(() => {
        last().open()
        last().push({})
    })
    return {
        ...hook,
        cached: () => client.getQueryData<LiveView>(liveKey),
        push: (view: LiveView) => act(() => last().pushView(view)),
    }
}

beforeEach(() => {
    FakeSocket.all = []
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    state.reads = []
    state.latest = undefined
    vi.unstubAllGlobals()
})

describe("useLiveMatch — a REST read never repaints over a newer stream frame", () => {
    it("keeps the frame's view when a refetch answers with an older version", async () => {
        const hook = await setup(readOf(5, "phase1"))
        hook.push(readOf(6, "question"))
        expect(hook.cached()?.version).toBe(6)

        state.reads = [readOf(4, "phase1")]
        await act(async () => {
            hook.result.current.refetch()
        })

        expect(hook.cached()?.version).toBe(6)
        expect(hook.cached()?.stage).toBe("question")
        hook.unmount()
    })

    it("paints a read that is newer than the cache", async () => {
        const hook = await setup(readOf(5, "phase1"))
        hook.push(readOf(6, "question"))

        state.reads = [readOf(7, "pending")]
        await act(async () => {
            hook.result.current.refetch()
        })

        expect(hook.cached()?.version).toBe(7)
        expect(hook.cached()?.stage).toBe("pending")
        hook.unmount()
    })

    it("paints a read without a version — it cannot be proven stale", async () => {
        const hook = await setup(readOf(5, "phase1"))
        hook.push(readOf(6, "question"))

        state.reads = [{ ...readOf(0, "summary"), version: undefined } as unknown as LiveView]
        await act(async () => {
            hook.result.current.refetch()
        })

        expect(hook.cached()?.stage).toBe("summary")
        hook.unmount()
    })
})
