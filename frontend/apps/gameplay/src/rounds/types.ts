import type { ReactNode } from "react"
import type { PlayerCtx } from "@shared/deck/player-deck"

export interface RoundModule {
    render: (ctx: PlayerCtx) => ReactNode
}
