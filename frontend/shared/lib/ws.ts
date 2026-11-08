import { useEffect, useRef } from "react"


const BASE_BACKOFF_MS = 2_000
const MAX_BACKOFF_MS = 30_000

const STOP_CODES = new Set([4401, 4403])

function wsBase(): string {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    return `${protocol}//${window.location.host}`
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
            socket = new WebSocket(`${wsBase()}${path}`)
            socket.onmessage = (event) => {
                try {
                    handler.current(JSON.parse(String(event.data)))
                } catch {
                    // Malformed frame: ignore — HTTP stays the truth either way.
                }
            }
            socket.onopen = () => {
                attempt = 0 
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
                socket.onclose = null 
                socket.close()
            }
        }
    }, [path, enabled])
}
