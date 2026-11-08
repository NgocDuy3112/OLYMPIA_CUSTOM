import type { ReactNode } from "react"
import { Band } from "./strip"
import { StageLayout, Status } from "./primitives"

export function PlayerStage({ rail, band, hint, flash, children }: {
    rail?: ReactNode
    band: ReactNode
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
