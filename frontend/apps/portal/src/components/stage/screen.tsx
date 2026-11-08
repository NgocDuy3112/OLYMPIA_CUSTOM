import type { ReactNode } from "react"
import { StageLayout, Status, Strip, type StripItem } from "@shared/deck/stage"

export function ConsoleStage({ rail, actions, flash, children }: {
    rail?: ReactNode
    actions: StripItem[]
    flash: string | null
    children: ReactNode
}) {
    return (
        <StageLayout rail={rail}>
            {children}
            <Strip items={actions} />
            <Status error={flash} />
        </StageLayout>
    )
}
