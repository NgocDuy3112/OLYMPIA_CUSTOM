import { createContext } from "react"
import type { HubInvoker } from "@shared/lib/ws"

export const LiveHubContext = createContext<HubInvoker | null>(null)
