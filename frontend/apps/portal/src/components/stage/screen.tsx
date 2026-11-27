import { useContext } from "react"
import type { ReactNode } from "react"
import { StageLayout, Status, Strip, type StripItem } from "@shared/deck/stage"
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
            <div className="flex min-w-0 flex-wrap items-center gap-[1cqw] overflow-x-auto">
                <Strip items={items} />
            </div>
            <Status error={flash} />
        </StageLayout>
    )
}
