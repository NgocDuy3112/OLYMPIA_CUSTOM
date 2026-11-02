// The player screens' frame: the rail column, the round's card(s), the action
// band and the status line. Every player screen ended with the identical
// StageLayout > …card… > Band > Status stack; this is that stack, once.
//
// A screen supplies only what differs: the rail variant, the band's contents
// and the status hint. Purely presentational — no hooks, no data.
import type { ReactNode } from "react"
import { Band } from "./strip"
import { StageLayout, Status } from "./primitives"

export function PlayerStage({ rail, band, hint, flash, children }: {
    rail?: ReactNode
    /** The band's contents — the round's controls. */
    band: ReactNode
    /** The muted context line under the band (refusal flash overrides it). */
    hint?: ReactNode
    flash: string | null
    children: ReactNode
}) {
    return (
        <StageLayout rail={rail}>
            {children}
            <Band>{band}</Band>
            <Status error={flash} hint={hint} />
        </StageLayout>
    )
}
