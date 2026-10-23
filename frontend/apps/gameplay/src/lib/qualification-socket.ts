import { useEffect, useRef } from "react"



const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

// Backend close codes: these answers will not change by reconnecting.
// 4401 SESSION_ENDED (revoked session), 4403 NOT_SEATED (not in this match).
const STOP_CODES = new Set([4401, 4403])

function wsBase(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}`
}

export function useQualificationStream(
    matchId: string,
    enabled: boolean,
    onSignal: () => void
) {
    // The callback lives in a ref so a re-render never re-dials the socket.
    const handler = useRef(onSignal)
    useEffect(() => {
        handler.current = onSignal
    }, [onSignal])

    useEffect(() => {
        if (!enabled || !matchId) return

        let socket: WebSocket | null = null
        let stopped = false
        let attempt = 0
        let timer: ReturnType<typeof setTimeout> | undefined

        const connect = () => {
            if (stopped) return
            socket = new WebSocket(`${wsBase()}/gameplay/matches/${matchId}/qualification/stream`)

            // Handlers attach AT CONSTRUCTION: the server's sync can arrive in the
            // same tick as "open" — a listener attached after an await loses it
            // (the C1 integration test caught exactly this race).
            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(String(event.data)) as { type?: string }
                    if (message.type === "sync" || message.type === "refresh") {
                        handler.current()
                    }
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
    }, [matchId, enabled])
}
