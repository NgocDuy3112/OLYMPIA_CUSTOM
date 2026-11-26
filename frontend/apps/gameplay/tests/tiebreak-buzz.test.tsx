import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useTieBreakMatch, type TieBreakView } from "@/lib/live"
import { LiveHubProvider } from "@/components/live-hub-provider"

const state = vi.hoisted(() => ({ view: undefined as TieBreakView | undefined }))

vi.mock("@shared/lib/api", () => ({
    api: vi.fn(async () => state.view),
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

function view(): TieBreakView {
    return {
        matchId: "m1",
        version: 3,
        stage: "tiebreak",
        questionId: "q1",
        cursor: 0,
        ended: false,
        windowOpen: true,
        deadlineAt: null,
        question: null,
        me: null,
        players: [],
        window: {
            mode: "Buzz",
            eligibility: "Pair",
            pairA: "u1",
            pairB: "u2",
            openedAt: "2026-01-01T00:00:00.000Z",
            seconds: 20,
            closesAt: null,
            turnPlayerId: null,
            buzzer: null,
            buzzerMs: null,
            locked: false,
        },
    }
}

beforeEach(() => {
    FakeSocket.all = []
    state.view = view()
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

function draw() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>
            <LiveHubProvider matchId="m1" enabled>
                {children}
            </LiveHubProvider>
        </QueryClientProvider>
    )
    const hook = renderHook(() => useTieBreakMatch("m1", true), { wrapper })
    act(() => {
        last().open()
        last().push({})
    })
    return hook
}

describe("the tie-break buzz — the press shows before the ack", () => {
    it("marks the button pressed on click, and clears it with the refusal", async () => {
        const { result } = draw()
        await waitFor(() => expect(result.current.view?.questionId).toBe("q1"))
        expect(result.current.buzzed).toBe(false)

        act(() => result.current.buzz.mutate("q1"))
        await waitFor(() => expect(result.current.buzzed).toBe(true))

        const frame = JSON.parse(last().sent[last().sent.length - 1].replace("\u001e", ""))
        const requestId = frame.arguments[0].requestId as string
        act(() => {
            last().push({
                target: "message",
                arguments: [{ type: "error", requestId, data: { message: "Cửa sổ chuông đã đóng" } }],
            })
        })

        await waitFor(() => expect(result.current.buzzed).toBe(false))
        expect(result.current.buzz.error).toBeInstanceOf(Error)
        expect(result.current.buzz.error?.message).toBe("Cửa sổ chuông đã đóng")
    })
})
