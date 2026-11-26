import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isOlderView, useLiveHub, type LiveView } from "@/lib/live"

const HANDSHAKE_ACK = {}

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
    pushView(view: Partial<LiveView> | null) {
        this.push({ target: "message", arguments: [{ type: "view", at: "2026-01-01T00:00:00.000Z", data: { view } }] })
    }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]

const liveKey = ["live", "m1"] as const

function viewOf(version: number | undefined, stage = "question"): LiveView {
    return {
        matchId: "m1",
        roundId: "khoi-dong",
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

function setup(cached: LiveView | undefined) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    if (cached) client.setQueryData(liveKey, cached)
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { unmount } = renderHook(() => useLiveHub("m1", true), { wrapper })
    act(() => {
        last().open()
        last().push(HANDSHAKE_ACK)
    })
    return {
        cached: () => client.getQueryData<LiveView>(liveKey),
        push: (view: Partial<LiveView> | null) => act(() => last().pushView(view)),
        unmount,
    }
}

beforeEach(() => {
    FakeSocket.all = []
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

describe("isOlderView — only two comparable versions prove staleness", () => {
    it("an older version is stale", () => {
        expect(isOlderView({ version: 4 }, { version: 5 })).toBe(true)
    })

    it("an equal or newer version is not stale", () => {
        expect(isOlderView({ version: 5 }, { version: 5 })).toBe(false)
        expect(isOlderView({ version: 6 }, { version: 5 })).toBe(false)
    })

    it("a missing version on either side is not proof — the frame still paints", () => {
        expect(isOlderView({}, { version: 5 })).toBe(false)
        expect(isOlderView({ version: 4 }, {})).toBe(false)
        expect(isOlderView(null, { version: 5 })).toBe(false)
        expect(isOlderView({ version: 4 }, null)).toBe(false)
    })
})

describe("useLiveHub — a view frame never paints over a newer view", () => {
    it("drops a frame older than the cached view", () => {
        const hub = setup(viewOf(5, "question"))
        hub.push(viewOf(4, "phase1"))
        expect(hub.cached()?.version).toBe(5)
        expect(hub.cached()?.stage).toBe("question")
        hub.unmount()
    })

    it("paints a frame newer than the cached view", () => {
        const hub = setup(viewOf(5, "pending"))
        hub.push(viewOf(6, "question"))
        expect(hub.cached()?.version).toBe(6)
        expect(hub.cached()?.stage).toBe("question")
        hub.unmount()
    })

    it("paints a frame that carries no version — it cannot be compared", () => {
        const hub = setup(viewOf(5, "pending"))
        hub.push(viewOf(undefined, "question"))
        expect(hub.cached()?.stage).toBe("question")
        hub.unmount()
    })

    it("paints the first frame when nothing is cached yet", () => {
        const hub = setup(undefined)
        hub.push(viewOf(1, "question"))
        expect(hub.cached()?.version).toBe(1)
        hub.unmount()
    })
})
