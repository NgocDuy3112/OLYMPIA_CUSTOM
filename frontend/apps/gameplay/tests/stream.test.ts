import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useSocketStream, useHubInvoker } from "@shared/lib/ws"

const HANDSHAKE = { protocol: "json", version: 1 }

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

    /** Test helper: the socket agreed to open. */
    open() {
        this.readyState = FakeSocket.OPEN
        this.onopen?.(new Event("open"))
    }

    push(payload: unknown) {
        this.onmessage?.({ data: `${JSON.stringify(payload)}\u001e` } as MessageEvent)
    }
}

function last(): FakeSocket {
    const socket = FakeSocket.all[FakeSocket.all.length - 1]
    if (!socket) throw new Error("no socket opened")
    return socket
}

beforeEach(() => {
    FakeSocket.all = []
    vi.useFakeTimers()
    vi.stubGlobal("WebSocket", FakeSocket)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe("useSocketStream — connection state and resync signal", () => {
    it("reports live after the handshake and bumps generation", () => {
        const { result } = renderHook(() => useSocketStream("/live/stream", true, () => {}))
        expect(result.current.status).toBe("connecting")

        act(() => {
            last().open()
            last().push(HANDSHAKE)
        })
        expect(result.current.status).toBe("live")
        expect(result.current.generation).toBe(1)
    })

    it("reconnects after a drop and bumps generation again", () => {
        const { result } = renderHook(() => useSocketStream("/live/stream", true, () => {}))
        act(() => {
            last().open()
            last().push(HANDSHAKE)
        })
        const first = last()

        act(() => {
            first.close() // remote hang-up
        })
        expect(result.current.status).toBe("reconnecting")

        act(() => {
            vi.advanceTimersByTime(2_000)
        })
        const second = last()
        expect(second).not.toBe(first)
        act(() => {
            second.open()
            second.push(HANDSHAKE)
        })
        expect(result.current.status).toBe("live")
        expect(result.current.generation).toBe(2)
    })

    it("stops for good when the server refuses the ticket (4401)", () => {
        const { result } = renderHook(() => useSocketStream("/live/stream", true, () => {}))
        const first = last()
        act(() => {
            first.readyState = 3
            first.onclose?.({ code: 4401 } as CloseEvent)
        })
        expect(result.current.status).toBe("stopped")

        act(() => {
            vi.advanceTimersByTime(120_000)
        })
        expect(result.current.status).toBe("stopped")
        expect(FakeSocket.all).toHaveLength(1)
    })

    it("exposes a manual reconnect that skips the backoff", () => {
        const { result } = renderHook(() => useSocketStream("/live/stream", true, () => {}))
        act(() => {
            last().close()
        })
        expect(result.current.status).toBe("reconnecting")
        expect(FakeSocket.all).toHaveLength(1)
        act(() => {
            result.current.reconnect()
        })
        expect(FakeSocket.all).toHaveLength(2)
    })
})

describe("useHubInvoker — an ack never leaves a button pending forever", () => {
    const ack = (requestId: string) => ({
        target: "message",
        arguments: [
            {
                type: "ack",
                requestId,
                data: { ok: true },
            },
        ],
    })

    it("resolves an invoke with the server lhs ack", async () => {
        const { result } = renderHook(() => useHubInvoker("/live/stream", true))
        act(() => {
            last().open()
            last().push(HANDSHAKE)
        })
        expect(result.current.ready).toBe(true)

        let settled: unknown = null
        await act(async () => {
            const promise = result.current.invoke("Buzz", [{ v: 1, type: "buzz", data: { questionId: "q1" } }])
            const frame = last().sent[last().sent.length - 1]
            const requestId = (JSON.parse(frame.replace("\u001e", "")).arguments[0] as { requestId: string }).requestId
            last().push(ack(requestId))
            settled = await promise
        })
        expect(settled).toEqual({ ok: true })
    })

    it("rejects after the timeout when the server never answers", async () => {
        const { result } = renderHook(() => useHubInvoker("/live/stream", true))
        act(() => {
            last().open()
            last().push(HANDSHAKE)
        })

        let error: Error | null = null
        await act(async () => {
            const promise = result.current.invoke("Buzz", [{ questionId: "q1" }])
            const guarded = promise.catch((e: Error) => {
                error = e
                return null
            })
            await vi.advanceTimersByTimeAsync(8_000)
            await guarded
        })
        const message = (error as Error | null)?.message ?? ""
        expect(message).toMatch(/không phản hồi/)
    })

    it("rejects when the socket is not ready", async () => {
        const { result } = renderHook(() => useHubInvoker("/live/stream", true))
        act(() => {
            last().open() // no handshake yet
        })
        await expect(
            act(async () => {
                await result.current.invoke("Buzz", [{ questionId: "q1" }])
            })
        ).rejects.toThrow(/chưa sẵn sàng/)
    })
})

describe("one hub — view frames and invocations share a single socket", () => {
    it("delivers view frames to onMessage and hands acks back to invoke", async () => {
        const frames: unknown[] = []
        const { result } = renderHook(() =>
            useHubInvoker("/api/matches/m1/live/stream", true, {
                onMessage: (message) => frames.push(message),
            })
        )
        act(() => {
            last().open()
            last().push(HANDSHAKE)
        })
        expect(FakeSocket.all).toHaveLength(1)

        // A view frame has no requestId: it goes to the stream consumer.
        const view = { type: "view", data: { view: { version: 7 } } }
        act(() => {
            last().push({ target: "message", arguments: [view] })
        })
        expect(frames).toEqual([{ type: "view", data: { view: { version: 7 } } }])

        // An invocation travels up the very same socket.
        let settled: unknown = null
        await act(async () => {
            const promise = result.current.invoke("Buzz", [{ questionId: "q1" }])
            const frame = JSON.parse(last().sent[last().sent.length - 1].replace("\u001e", "")) as {
                arguments: Array<{ requestId: string }>
            }
            act(() => {
                last().push({
                    target: "message",
                    arguments: [{ type: "ack", requestId: frame.arguments[0].requestId, data: { ok: true } }],
                })
            })
            settled = await promise
        })
        expect(settled).toEqual({ ok: true })
        expect(FakeSocket.all).toHaveLength(1)
        // The ack was consumed by the invoker, not leaked into the stream.
        expect(frames).toHaveLength(1)
    })

    it("useSocketStream is the same connection, so a deck + buzz pair opens one socket", () => {
        const { result } = renderHook(() => {
            const stream = useSocketStream("/api/matches/m1/live/stream", true, () => {})
            return stream
        })
        act(() => {
            last().open()
            last().push(HANDSHAKE)
        })
        expect(result.current.status).toBe("live")
        expect(FakeSocket.all).toHaveLength(1)
    })
})
