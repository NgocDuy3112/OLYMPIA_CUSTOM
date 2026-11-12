import type { ReactNode } from "react"
import { StageLayout, Status, Strip, type StripItem } from "@shared/deck/stage"
import { StripControls } from "@/console/ConsoleToolbar"

export function ConsoleStage({ rail, actions, flash, children }: {
    rail?: ReactNode
    actions: StripItem[]
    flash: string | null
    children: ReactNode
}) {
    return (
        <StageLayout rail={rail}>
            {children}
            <div className="flex flex-wrap items-center gap-[1cqw]">
                <Strip items={actions} />
                <StripControls />
            </div>
            <Status error={flash} />
        </StageLayout>
    )
}
