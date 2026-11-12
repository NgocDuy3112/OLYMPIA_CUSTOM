import type { ReactNode } from "react"
import { StageLayout } from "./primitives"

export function PlayerStage({ rail, children }: {
    rail?: ReactNode
    children: ReactNode
}) {
    return (
        <StageLayout rail={rail}>
            {children}
        </StageLayout>
    )
}
