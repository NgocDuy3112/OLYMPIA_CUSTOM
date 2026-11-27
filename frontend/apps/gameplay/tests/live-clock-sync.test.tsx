import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useLiveMatch } from "@/lib/live"
import { LiveHubProvider } from "@/components/live-hub-provider"
import { useCountdown } from "@shared/lib/clock"
import type { PlayerView } from "@shared/wire/live"

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

// The client clock runs 45 s ahead of the server, the way a laptop with a
// drifting clock does. Every deadline the server sends is in server time.
const SERVER_NOW = Date.parse("2026-01-01T12:00:00.000Z")
const CLIENT_NOW = SERVER_NOW + 45_000
const DEADLINE = new Date(SERVER_NOW + 10_000).toISOString()

function view(): PlayerView {
    return {
        matchId: "m1",
        roundId: "giai-ma",
        version: 1,
        stage: "hints",
        open: [{ questionId: "q1", deadlineAt: DEADLINE, question: null }],
        table: [],
        hintAnswers: {},
        keywordDeadlineAt: null,
        keywordLength: 7,
        keywordKind: "letters",
        me: { pickedTiles: [], hintVerdicts: {} },
    }
}

/** The deck's own countdown (use-player-model builds `remaining` the same way). */
function useDeckCountdown() {
    const live = useLiveMatch("m1", true)
    const open = live.view?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, live.clock)
    return { remaining, skew: live.clock.skew() }
}

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <LiveHubProvider matchId="m1" enabled>{children}</LiveHubProvider>
        </QueryClientProvider>
    )
    return renderHook(() => useDeckCountdown(), { wrapper })
}

beforeEach(() => {
    FakeSocket.all = []
    vi.stubGlobal("WebSocket", FakeSocket)
    vi.spyOn(Date, "now").mockReturnValue(CLIENT_NOW)
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe("the player clock — the deck counts down in server time", () => {
    it("an untrustworthy client clock is corrected by the frame's `at`", () => {
        const hook = setup()

        act(() => {
            last().open()
            last().push({})
            // Wrapped the way the hub delivers it: frame → arguments[0].
            last().push({
                target: "message",
                arguments: [
                    {
                        v: 1,
                        type: "view",
                        at: new Date(SERVER_NOW).toISOString(),
                        data: { view: view() },
                    },
                ],
            })
        })

        // Server truth: 10 s left. On the raw client clock the deadline is 35 s
        // in the past, so the deck would show 0:00 and lock its answer box.
        expect(hook.result.current.remaining).toBe(10_000)
        expect(hook.result.current.skew).toBe(SERVER_NOW - CLIENT_NOW)
        hook.unmount()
    })

    it("without a frame the clock stays at the client's own reading", () => {
        const hook = setup()

        act(() => {
            last().open()
            last().push({})
        })

        expect(hook.result.current.skew).toBe(0)
        expect(hook.result.current.remaining).toBe(0)
        hook.unmount()
    })
})
