import type { ReactNode } from "react"
import type { PlayerCtx } from "@shared/deck/player-deck"

/**
 * A round's PLAYER surface as one pluggable module (see rounds/index.ts) —
 * the mirror of the controller's registry. The OC4 suffix names THIS ruleset;
 * a custom tournament registers its own round module to mix rule variants,
 * and the future OBS overlay reuses the same registry.
 */
export interface RoundModule {
    /** Draw the round — returns elements (never a component made during render). */
    render: (ctx: PlayerCtx) => ReactNode
}
