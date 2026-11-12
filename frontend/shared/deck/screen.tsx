import type { ReactNode } from "react"
import { Band } from "./strip"
import { StageLayout } from "./primitives"

export function PlayerStage({ rail, band, children }: {
    rail?: ReactNode
    band: ReactNode
    children: ReactNode
}) {
    return (
        <StageLayout rail={rail}>
            {children}
            <Band>{band}</Band>
        </StageLayout>
    )
}
