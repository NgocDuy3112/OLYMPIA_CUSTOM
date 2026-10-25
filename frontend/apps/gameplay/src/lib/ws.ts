import { useEffect, useRef } from "react"

// One place for what every gameplay socket shares: how to dial the backend, how
// long to wait before trying again, and when to stop trying at all. The
// qualification turn channel and the live match channel both ride this.

const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

// Backend close codes that reconnecting will never fix:
// 4401 SESSION_ENDED (revoked session), 4403 NOT_SEATED (not in this match).
export const STOP_CODES = new Set([4401, 4403])

export function wsBase(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}`
}

/**
 * Dial `path` (e.g. `/gameplay/matches/<id>/live/stream`) while `enabled`.
 *
 * - `null` path = no dial (a match id or a gate not yet passed).
 * - Every parsed frame goes to `onMessage`; malformed frames are ignored — HTTP
 *   stays the truth either way.
 * - The callback lives in a ref: a new closure never re-dials the socket.
 * - Exponential backoff (2 s → 30 s), reset on a successful open; STOP_CODES end
 *   the stream for good, unmount cancels a scheduled reconnect.
 */
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
            socket = new WebSocket(`${wsBase()}${path}`)
            socket.onmessage = (event) => {
                try {
                    handler.current(JSON.parse(String(event.data)))
                } catch {
                    // Malformed frame: ignore — HTTP stays the truth either way.
                }
            }
            socket.onopen = () => {
                attempt = 0 // a fresh connection earns a fresh backoff
            }
            socket.onclose = (event) => {
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
                socket.onclose = null // unmount must not schedule a reconnect
                socket.close()
            }
        }
    }, [path, enabled])
}
