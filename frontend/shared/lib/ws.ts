import { useEffect, useRef } from "react"


const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

const STOP_CODES = new Set([4401, 4403])

/** SignalR's JSON protocol frames records with 0x1e (record separator). */
const RS = "\u001e"
const HANDSHAKE = `{"protocol":"json","version":1}${RS}`
const PING = `{"type":6}${RS}`

function wsBase(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}`
}

interface Frame {
    type?: number | string
    target?: string
    arguments?: unknown[]
}

/**
 * The hub wraps every envelope as { type: 1, target: "message", arguments: [envelope] } —
 * the caller gets the envelope itself, exactly what this stream always delivered.
 * Anything else (handshake reply, ping, close notice) is not an envelope.
 */
function envelopeOf(frame: Frame): unknown {
    if (frame.target !== "message" || !Array.isArray(frame.arguments)) return undefined
    return frame.arguments[0]
}

/** A view/console frame proves the hub accepted this connection; an error frame does not. */
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
                        // Malformed record: ignore — HTTP stays the truth either way.
                        continue
                    }

                    // Answer the hub's keep-alive ping, or it times the socket out.
                    if (frame.type === 6) {
                        if (ws.readyState === WebSocket.OPEN) ws.send(PING)
                        continue
                    }

                    const envelope = envelopeOf(frame)
                    if (envelope === undefined) continue
                    // Only a real payload proves the hub accepted this connection:
                    // a rejected one (session gone, seat gone) gets an error frame
                    // and then an abort, and must back off instead of hammering.
                    if (isPayload(envelope)) attempt = 0
                    handler.current(envelope)
                }
            }

            ws.onopen = () => {
                // The hub speaks SignalR: it holds the socket until the handshake
                // lands, then pushes the first view through the same connection.
                ws.send(HANDSHAKE)
            }

            ws.onclose = (event) => {
                if (stopped || STOP_CODES.has(event.code)) return
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
