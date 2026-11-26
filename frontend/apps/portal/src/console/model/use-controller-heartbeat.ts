import { useEffect, useState } from "react"
import { ApiError } from "@shared/lib/api"
import { postHeartbeat } from "@/lib/live"

const HEARTBEAT_INTERVAL_MS = 30_000

export function useControllerHeartbeat(tournamentId: string, matchId: string): string | null {
    const [refusal, setRefusal] = useState<string | null>(null)

    useEffect(() => {
        let stopped = false
        const beat = async () => {
            try {
                await postHeartbeat(tournamentId, matchId)
            } catch (cause) {
                if (stopped) return
                if (!(cause instanceof ApiError) || cause.status !== 409) return
                stopped = true
                setRefusal(cause.message)
            }
        }
        void beat()
        const timer = setInterval(() => {
            if (stopped) return
            void beat()
        }, HEARTBEAT_INTERVAL_MS)
        return () => {
            stopped = true
            clearInterval(timer)
        }
    }, [tournamentId, matchId])

    return refusal
}
