import { useCallback, useEffect, useRef, useState } from "react"
import { logError } from "./log"


const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

/** Drop the stream silently when an idle socket stops answering pings. */
const WATCHDOG_MS = 45_000

const STOP_CODES = new Set([4401, 4403])

const RS = "\u001e"
const HANDSHAKE = `{"protocol":"json","version":1}${RS}`
const PING = `{"type":6}${RS}`

function wsBase(): string {
    let protocol = "ws:"
    if (window.location.protocol === "https:") protocol = "wss:"
    return `${protocol}//${window.location.host}`
}

interface Frame {
    error?: string
    type?: number | string
    target?: string
    arguments?: unknown[]
}

function envelopeOf(frame: Frame): unknown {
    if (frame.target !== "message" || !Array.isArray(frame.arguments)) return undefined
    return frame.arguments[0]
}

export type StreamStatus =
    | "idle"          // not started (no path / disabled)
    | "connecting"    // first attempt
    | "live"          // handshake done, frames flowing
    | "reconnecting"  // dropped, backing off, will retry
    | "stopped"       // refused by the server (4401/4403) — no retry

export interface StreamState {
    status: StreamStatus
    /**
     * Bumps every time a *new* connection completes its handshake. Views keyed on
     * it can refetch once — the stream cannot replay what it missed while down.
     */
    generation: number
    reconnect: () => void
}

let invocationSeq = 0

interface PendingInvoke {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
}

export interface HubInvoker extends StreamState {
    ready: boolean
    invoke: (target: string, args: unknown[], timeoutMs?: number) => Promise<unknown>
}

/** Server acks are expected within the blink of an eye; never leave a button pending. */
export const INVOKE_TIMEOUT_MS = 8_000

export interface HubOptions {
    /** Envelopes the invoker does not own (no matching requestId) are handed here. */
    onMessage?: (message: unknown) => void
}

/**
 * The one SignalR-style connection for a stream path.
 *
 * A hub tickets one connection per identity, so opening a second socket to the
 * same path makes the server refuse one of them. Everything belonging to a hub
 * therefore shares this socket: pass `onMessage` to consume view frames and
 * `invoke` to talk back.
 *
 * Frames are only delivered while connected; after a drop the caller must
 * resync because the server does not replay missed frames. `generation`
 * changes on every successful (re)connect so a consumer can refetch exactly once.
 */
export function useHubInvoker(
    path: string | null,
    enabled: boolean,
    options: HubOptions = {}
): HubInvoker {
    const socketRef = useRef<WebSocket | null>(null)
    const pendingRef = useRef(new Map<string, PendingInvoke>())
    const readyRef = useRef(false)
    const onMessageRef = useRef(options.onMessage)
    useEffect(() => {
        onMessageRef.current = options.onMessage
    }, [options.onMessage])

    // `{ run, ... }` pairs: the effect labels its own run instead of resetting
    // state from its body, so a new path can never inherit a stale connection.
    const [run, setRun] = useState(0)
    const [reported, setReported] = useState<{ run: number; status: StreamStatus }>({
        run: 0,
        status: "idle",
    })
    const [generation, setGeneration] = useState(0)
    const kickRef = useRef<(() => void) | null>(null)

    const key = enabled && path ? path : null
    const [seenKey, setSeenKey] = useState(key)
    if (seenKey !== key) {
        setSeenKey(key)
        setRun((value) => value + 1)
    }
    const status: StreamStatus = !key
        ? "idle"
        : reported.run === run
            ? reported.status
            : "connecting"
    // `invoke` re-checks the socket itself; the status is the render-safe truth.
    const ready = status === "live"

    useEffect(() => {
        if (!enabled || !path) {
            kickRef.current = null
            return
        }

        const thisRun = run
        const report = (next: StreamStatus) => setReported({ run: thisRun, status: next })

        let socket: WebSocket | null = null
        let stopped = false
        let attempt = 0
        let timer: ReturnType<typeof setTimeout> | undefined
        let watchdog: ReturnType<typeof setTimeout> | undefined
        readyRef.current = false

        const settle = (id: string, done: (pending: PendingInvoke) => void) => {
            const pending = pendingRef.current.get(id)
            if (!pending) return
            pendingRef.current.delete(id)
            clearTimeout(pending.timer)
            done(pending)
        }

        const failPending = (reason: string) => {
            for (const id of [...pendingRef.current.keys()])
                settle(id, (pending) => pending.reject(new Error(reason)))
        }

        const armWatchdog = (ws: WebSocket) => {
            if (watchdog !== undefined) clearTimeout(watchdog)
            watchdog = setTimeout(() => {
                // Half-open sockets never fire `onclose`; force one so the
                // reconnect path runs instead of showing a frozen screen.
                if (ws.readyState === WebSocket.OPEN) ws.close()
            }, WATCHDOG_MS)
        }

        const connect = () => {
            if (stopped) return
            const ws = new WebSocket(`${wsBase()}${path}`)
            socket = ws
            socketRef.current = ws
            if (attempt === 0) report("connecting")
            else report("reconnecting")

            ws.onmessage = (event) => {
                armWatchdog(ws)
                for (const part of String(event.data).split(RS)) {
                    const text = part.trim()
                    if (!text) continue

                    let frame: Frame
                    try {
                        frame = JSON.parse(text) as Frame
                    } catch {
                        continue
                    }

                    if (frame.type === undefined && frame.target === undefined) {
                        // Handshake response. SignalR answers with a bare object
                        // (`{}` here; some versions echo `{"protocol":"json"}`), and
                        // every hub message after it carries `type` or `target`.
                        if (frame.error) {
                            logError("ws", `handshake refused · ${frame.error}`)
                            continue
                        }
                        // One ack per connection: a repeat is not a new connection.
                        if (readyRef.current) continue
                        readyRef.current = true
                        attempt = 0
                        report("live")
                        setGeneration((value) => value + 1)
                        continue
                    }

                    if (frame.type === 6) {
                        if (ws.readyState === WebSocket.OPEN) ws.send(PING)
                        continue
                    }

                    const envelope = envelopeOf(frame)
                    if (envelope === undefined) continue
                    const message = envelope as {
                        type?: string
                        requestId?: string
                        data?: { code?: string; message?: string }
                    }
                    const requestId = message.requestId
                    if (requestId && pendingRef.current.has(requestId)) {
                        if (message.type === "ack") {
                            settle(requestId, (pending) => pending.resolve(message.data))
                        } else {
                            settle(requestId, (pending) =>
                                pending.reject(new Error(message.data?.message ?? "yêu cầu thất bại"))
                            )
                        }
                        continue
                    }
                    // Not one of ours: a stream frame for the caller.
                    onMessageRef.current?.(envelope)
                }
            }

            ws.onopen = () => {
                ws.send(HANDSHAKE)
                armWatchdog(ws)
            }

            ws.onclose = (event) => {
                if (watchdog !== undefined) clearTimeout(watchdog)
                if (stopped) return
                readyRef.current = false
                failPending("lost connection")
                if (STOP_CODES.has(event.code)) {
                    logError("ws", `live stream closed ${event.code} · ${path}`)
                    report("stopped")
                    return
                }
                const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
                attempt += 1
                report("reconnecting")
                timer = setTimeout(connect, delay)
            }
        }

        kickRef.current = () => {
            if (stopped) return
            if (timer !== undefined) clearTimeout(timer)
            if (socket) {
                socket.onclose = null
                try {
                    socket.close()
                } catch {
                    // already closing
                }
            }
            attempt = 0
            connect()
        }

        connect()

        return () => {
            stopped = true
            kickRef.current = null
            readyRef.current = false
            failPending("lost connection")
            if (timer !== undefined) clearTimeout(timer)
            if (watchdog !== undefined) clearTimeout(watchdog)
            if (socket) {
                socket.onclose = null
                socket.close()
            }
        }
    }, [path, enabled, run])

    const reconnect = useCallback(() => {
        kickRef.current?.()
    }, [])

    const invoke = (
        target: string,
        args: unknown[],
        timeoutMs: number = INVOKE_TIMEOUT_MS
    ): Promise<unknown> => {
        const ws = socketRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN || !readyRef.current) {
            return Promise.reject(new Error("chuông chưa sẵn sàng"))
        }
        invocationSeq += 1
        const id = String(invocationSeq)
        const envelope = { ...(args[0] as Record<string, unknown>), requestId: id }
        const frame = { type: 1, invocationId: id, target, arguments: [envelope] }
        return new Promise<unknown>((resolve, reject) => {
            const timer = setTimeout(() => {
                if (!pendingRef.current.has(id)) return
                pendingRef.current.delete(id)
                reject(new Error("máy chủ không phản hồi — thử lại"))
            }, timeoutMs)
            pendingRef.current.set(id, { resolve, reject, timer })
            try {
                ws.send(`${JSON.stringify(frame)}${RS}`)
            } catch (error) {
                clearTimeout(timer)
                pendingRef.current.delete(id)
                reject(error instanceof Error ? error : new Error("không gửi được yêu cầu"))
            }
        })
    }

    return { ready, status, generation, reconnect, invoke }
}

/** Read-only view of a hub stream: no invocations, just frames and status. */
export function useSocketStream(
    path: string | null,
    enabled: boolean,
    onMessage: (message: unknown) => void
): StreamState {
    const { status, generation, reconnect } = useHubInvoker(path, enabled, { onMessage })
    return { status, generation, reconnect }
}
