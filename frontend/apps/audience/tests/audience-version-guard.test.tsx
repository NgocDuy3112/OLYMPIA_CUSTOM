import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { keepNewestRead, useAudienceLive } from "@/lib/audience"

const state = vi.hoisted(() => ({
    queue: [] as Array<{ version?: number; stage: string }>,
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

    pushConsole(view: unknown) {
        this.push({ target: "message", arguments: [{ type: "console", at: "2026-01-01T00:00:00.000Z", data: { view } }] })
    }
}

const last = () => FakeSocket.all[FakeSocket.all.length - 1]

vi.mock("@shared/lib/api", () => ({
    api: vi.fn(async () => state.queue.shift()),
    ApiError: class ApiError extends Error {},
}))

function read(version: number | undefined, stage: string) {
    return {
        matchId: "m1",
        roundId: "ve-dich",
        version,
        stage,
        open: [],
        table: [],
        hintAnswers: {},
        keywordDeadlineAt: null,
        keywordLength: 0,
        keywordKind: "letters",
        roundEnded: false,
    }
}

beforeEach(() => {
    FakeSocket.all = []
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    state.queue = []
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe("keepNewestRead — the poll never paints over a newer read", () => {
    it("drops a read older than the cached version", () => {
        expect(keepNewestRead<{ version?: number }>({ version: 5 }, { version: 4 })).toEqual({ version: 5 })
    })

    it("keeps an equal or newer read", () => {
        expect(keepNewestRead<{ version?: number }>({ version: 5 }, { version: 5 })).toEqual({ version: 5 })
        expect(keepNewestRead<{ version?: number }>({ version: 5 }, { version: 6 })).toEqual({ version: 6 })
    })

    it("keeps a read that carries no version on either side — nothing to compare", () => {
        expect(keepNewestRead<{ version?: number }>(undefined, { version: 1 })).toEqual({ version: 1 })
        expect(keepNewestRead<{ version?: number }>({ version: 5 }, {})).toEqual({})
        expect(keepNewestRead<{ version?: number }>({ version: 5 }, { version: 4 })).not.toEqual({ version: 4 })
    })
})

const audienceKey = ["audience", "t1", "m1"] as const

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const hook = renderHook(() => useAudienceLive("t1", "m1"), { wrapper })
    return { ...hook, client }
}

describe("useAudienceLive — the socket frame is the LED source", () => {
    it("paints a console frame into the audience cache", async () => {
        state.queue.push(read(5, "question"))
        const { client, unmount } = setup()
        await waitFor(() => expect(client.getQueryData(audienceKey)).toMatchObject({ version: 5 }))

        last().open()
        last().push({})
        act(() => last().pushConsole(read(6, "phase1")))

        expect(client.getQueryData(audienceKey)).toMatchObject({ version: 6, stage: "phase1" })
        unmount()
    })

    it("drops a console frame older than the cache", async () => {
        state.queue.push(read(5, "question"))
        const { client, unmount } = setup()
        await waitFor(() => expect(client.getQueryData(audienceKey)).toMatchObject({ version: 5 }))

        last().open()
        last().push({})
        act(() => last().pushConsole(read(4, "phase1")))

        expect(client.getQueryData(audienceKey)).toMatchObject({ version: 5, stage: "question" })
        unmount()
    })
})

describe("useAudienceLive — a late poll does not rewind the LED", () => {
    it("ignores a refetch whose version is behind the cache", async () => {
        state.queue.push(read(5, "question"))
        const { result, client, unmount } = setup()
        await waitFor(() => expect(result.current.data?.version).toBe(5))

        state.queue.push(read(4, "phase1"))
        await act(async () => {
            await result.current.refetch()
        })

        expect(client.getQueryData<{ version: number; stage: string }>(audienceKey)).toMatchObject({
            version: 5,
            stage: "question",
        })
        unmount()
    })

    it("paints a refetch that is newer", async () => {
        state.queue.push(read(5, "phase1"))
        const { result, client, unmount } = setup()
        await waitFor(() => expect(result.current.data?.version).toBe(5))

        state.queue.push(read(6, "question"))
        await act(async () => {
            await result.current.refetch()
        })

        expect(client.getQueryData<{ version: number; stage: string }>(audienceKey)).toMatchObject({
            version: 6,
            stage: "question",
        })
        unmount()
    })

    it("paints a read without a version — it cannot be proven stale", async () => {
        state.queue.push(read(5, "phase1"))
        const { result, client, unmount } = setup()
        await waitFor(() => expect(result.current.data?.version).toBe(5))

        state.queue.push(read(undefined, "question"))
        await act(async () => {
            await result.current.refetch()
        })

        expect(client.getQueryData<{ stage: string }>(audienceKey)?.stage).toBe("question")
        unmount()
    })
})
