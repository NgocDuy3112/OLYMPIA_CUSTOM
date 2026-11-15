import { useContext } from "react"
import type { ReactNode } from "react"
import { StageLayout, Status, Strip, type StripItem } from "@shared/deck/stage"
import { StripControls } from "@/console/ConsoleToolbar"
import { ConsoleControlContext } from "@/console/control-context"

export function ConsoleStage({ rail, actions, flash, children }: {
    rail?: ReactNode
    actions: StripItem[]
    flash: string | null
    children: ReactNode
}) {
    const control = useContext(ConsoleControlContext)
    let items = actions
    if (control?.blocked) {
        items = actions.map((item) => ({ ...item, onClick: undefined }))
    }
    return (
        <StageLayout rail={rail}>
            {children}
            <div className="flex flex-wrap items-center gap-[1cqw]">
                <Strip items={items} />
                <StripControls />
            </div>
            <Status error={flash} />
        </StageLayout>
    )
}
