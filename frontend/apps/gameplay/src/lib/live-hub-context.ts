import { createContext } from "react"
import type { ServerClock } from "@shared/lib/clock"
import type { HubInvoker } from "@shared/lib/ws"

export interface MatchStream {
    hub: HubInvoker
    clock: ServerClock
}

export const LiveHubContext = createContext<MatchStream | null>(null)
