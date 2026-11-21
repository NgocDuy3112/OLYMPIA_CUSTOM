import { useEffect, useRef, useState } from "react"
import { logError } from "./log"


const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

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
    protocol?: string
    type?: number | string
    target?: string
    arguments?: unknown[]
}

function envelopeOf(frame: Frame): unknown {
    if (frame.target !== "message" || !Array.isArray(frame.arguments)) return undefined
    return frame.arguments[0]
}

function isPayload(envelope: unknown): boolean {
    return (
        typeof envelope === "object" &&
        envelope !== null &&
        (envelope as { type?: unknown }).type !== "error"
    )
}

export function useSocketStream(
    path: string | null,
    enabled: boolean,
    onMessage: (message: unknown) => void
) {
    const handler = useRef(onMessage)
    useEffect(() => {
        handler.current = onMessage
    }, [onMessage])

    useEffect(() => {
        if (!enabled || !path) return

        let socket: WebSocket | null = null
        let stopped = false
        let attempt = 0
        let timer: ReturnType<typeof setTimeout> | undefined

        const connect = () => {
            if (stopped) return
            const ws = new WebSocket(`${wsBase()}${path}`)
            socket = ws

            ws.onmessage = (event) => {
                for (const part of String(event.data).split(RS)) {
                    const text = part.trim()
                    if (!text) continue

                    let frame: Frame
                    try {
                        frame = JSON.parse(text) as Frame
                    } catch {
                        continue
                    }

                    if (frame.type === 6) {
                        if (ws.readyState === WebSocket.OPEN) ws.send(PING)
                        continue
                    }

                    const envelope = envelopeOf(frame)
                    if (envelope === undefined) continue
                    if (isPayload(envelope)) attempt = 0
                    handler.current(envelope)
                }
            }

            ws.onopen = () => {
                ws.send(HANDSHAKE)
            }

            ws.onclose = (event) => {
                if (stopped || STOP_CODES.has(event.code)) {
                    if (STOP_CODES.has(event.code))
                        logError("ws", `live stream closed ${event.code} · ${path}`)
                    return
                }
                const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
                attempt += 1
                timer = setTimeout(connect, delay)
            }
        }

        connect()

        return () => {
            stopped = true
            if (timer !== undefined) clearTimeout(timer)
            if (socket) {
                socket.onclose = null
                socket.close()
            }
        }
    }, [path, enabled])
}

let invocationSeq = 0

interface PendingInvoke {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
}

export interface HubInvoker {
    ready: boolean
    invoke: (target: string, args: unknown[]) => Promise<unknown>
}

export function useHubInvoker(path: string | null, enabled: boolean): HubInvoker {
    const socketRef = useRef<WebSocket | null>(null)
    const pendingRef = useRef(new Map<string, PendingInvoke>())
    const [ready, setReady] = useState(false)
    const readyRef = useRef(false)

    useEffect(() => {
        if (!enabled || !path) return

        let socket: WebSocket | null = null
        let stopped = false
        let attempt = 0
        let timer: ReturnType<typeof setTimeout> | undefined
        readyRef.current = false
        setReady(false)

        const failPending = () => {
            for (const [, pending] of pendingRef.current)
                pending.reject(new Error("lost connection"))
            pendingRef.current.clear()
        }

        const connect = () => {
            if (stopped) return
            const ws = new WebSocket(`${wsBase()}${path}`)
            socket = ws
            socketRef.current = ws

            ws.onmessage = (event) => {
                for (const part of String(event.data).split(RS)) {
                    const text = part.trim()
                    if (!text) continue

                    let frame: Frame
                    try {
                        frame = JSON.parse(text) as Frame
                    } catch {
                        continue
                    }

                    if (frame.protocol === "json") {
                        readyRef.current = true
                        setReady(true)
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
                    if (!requestId) continue
                    const pending = pendingRef.current.get(requestId)
                    if (!pending) continue
                    pendingRef.current.delete(requestId)
                    if (message.type === "ack") pending.resolve(message.data)
                    else pending.reject(new Error(message.data?.message ?? "yêu cầu thất bại"))
                }
            }

            ws.onopen = () => {
                ws.send(HANDSHAKE)
            }

            ws.onclose = (event) => {
                failPending()
                if (stopped || STOP_CODES.has(event.code)) {
                    if (STOP_CODES.has(event.code))
                        logError("ws", `live stream closed ${event.code} · ${path}`)
                    return
                }
                const delay = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS)
                attempt += 1
                timer = setTimeout(connect, delay)
            }
        }

        connect()

        return () => {
            stopped = true
            readyRef.current = false
            failPending()
            if (timer !== undefined) clearTimeout(timer)
            if (socket) {
                socket.onclose = null
                socket.close()
            }
        }
    }, [path, enabled])

    const invoke = (target: string, args: unknown[]): Promise<unknown> => {
        const ws = socketRef.current
        if (!ws || ws.readyState !== WebSocket.OPEN || !readyRef.current) {
            return Promise.reject(new Error("chuông chưa sẵn sàng"))
        }
        invocationSeq += 1
        const id = String(invocationSeq)
        const envelope = { ...(args[0] as Record<string, unknown>), requestId: id }
        const frame = { type: 1, invocationId: id, target, arguments: [envelope] }
        const promise = new Promise<unknown>((resolve, reject) => {
            pendingRef.current.set(id, { resolve, reject })
        })
        ws.send(`${JSON.stringify(frame)}${RS}`)
        return promise
    }

    return { ready, invoke }
}
