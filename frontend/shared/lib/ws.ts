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

export interface AssistantToolCall {
    proposalId: string
    action: unknown
    rationale?: string
}

export interface AssistantFrame {
    turnId: string
    delta?: string
    toolCall?: AssistantToolCall
    done?: boolean
}

export type AssistantFrameRead =
    | { ok: true; frame: AssistantFrame }
    | { ok: false; error: string }

const INVALID_ASSISTANT_FRAME = "Khung assistant không hợp lệ"

function readToolCall(value: unknown): AssistantToolCall | null {
    if (typeof value !== "object" || value === null) return null
    const call = value as { proposalId?: unknown; action?: unknown; rationale?: unknown }
    if (typeof call.proposalId !== "string" || call.proposalId.length === 0) return null
    if (typeof call.action !== "object" || call.action === null) return null
    if (typeof (call.action as { kind?: unknown }).kind !== "string") return null
    if (call.rationale !== undefined && typeof call.rationale !== "string") return null
    const toolCall: AssistantToolCall = { proposalId: call.proposalId, action: call.action }
    if (call.rationale !== undefined) toolCall.rationale = call.rationale
    return toolCall
}

export function readAssistantFrame(envelope: unknown): AssistantFrameRead {
    if (typeof envelope !== "object" || envelope === null) {
        return { ok: false, error: INVALID_ASSISTANT_FRAME }
    }
    const { type, data } = envelope as { type?: unknown; data?: unknown }
    if (type !== "assistant") return { ok: false, error: INVALID_ASSISTANT_FRAME }
    if (typeof data !== "object" || data === null) {
        return { ok: false, error: "Khung assistant không có dữ liệu" }
    }
    const payload = data as { turnId?: unknown; delta?: unknown; toolCall?: unknown; done?: unknown }
    if (typeof payload.turnId !== "string" || payload.turnId.length === 0) {
        return { ok: false, error: "Khung assistant thiếu turnId" }
    }
    const frame: AssistantFrame = { turnId: payload.turnId }
    if (payload.delta !== undefined) {
        if (typeof payload.delta !== "string") {
            return { ok: false, error: "Khung assistant có delta không hợp lệ" }
        }
        frame.delta = payload.delta
    }
    if (payload.done !== undefined) {
        if (typeof payload.done !== "boolean") {
            return { ok: false, error: "Khung assistant có done không hợp lệ" }
        }
        frame.done = payload.done
    }
    if (payload.toolCall !== undefined) {
        const toolCall = readToolCall(payload.toolCall)
        if (toolCall === null) return { ok: false, error: "Đề xuất assistant không hợp lệ" }
        frame.toolCall = toolCall
    }
    if (frame.delta === undefined && frame.toolCall === undefined && frame.done !== true) {
        return { ok: false, error: "Khung assistant không có nội dung" }
    }
    return { ok: true, frame }
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
 * The hub accepts several subscriptions for the same identity, so a second
 * socket is not refused — it silently doubles every push and races the cache.
 * One connection per client is the goal: everything belonging to a hub shares
 * this socket, passing `onMessage` to consume view frames and `invoke` to talk
 * back.
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

        const stop = (ws: WebSocket, code: number) => {
            if (stopped) return
            stopped = true
            readyRef.current = false
            failPending("lost connection")
            if (timer !== undefined) clearTimeout(timer)
            if (watchdog !== undefined) clearTimeout(watchdog)
            report("stopped")
            logError("ws", `live stream stopped ${code} · ${path}`)
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close()
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
                        code?: number
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
                    if (
                        message.type === "error" &&
                        typeof message.code === "number" &&
                        STOP_CODES.has(message.code)
                    ) {
                        stop(ws, message.code)
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
