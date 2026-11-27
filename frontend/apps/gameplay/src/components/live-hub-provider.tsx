import type { ReactNode } from "react"
import { useServerClock } from "@shared/lib/clock"
import { useLiveHub } from "@/lib/live"
import { LiveHubContext } from "@/lib/live-hub-context"

export function LiveHubProvider({
    matchId,
    enabled,
    children,
}: {
    matchId: string
    enabled: boolean
    children: ReactNode
}) {
    const clock = useServerClock()
    const hub = useLiveHub(matchId, enabled && Boolean(matchId), clock.sync)
    return <LiveHubContext.Provider value={{ hub, clock }}>{children}</LiveHubContext.Provider>
}
