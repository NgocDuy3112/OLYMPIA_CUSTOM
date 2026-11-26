import type { ReactNode } from "react"
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
    const hub = useLiveHub(matchId, enabled && Boolean(matchId))
    return <LiveHubContext.Provider value={hub}>{children}</LiveHubContext.Provider>
}
