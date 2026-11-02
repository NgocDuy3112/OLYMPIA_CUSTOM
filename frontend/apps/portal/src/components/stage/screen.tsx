// The console screens' frame: the rail column, the round's card(s), the action strip
// and the status line. All seven controllers ended with the identical
// StageLayout > …card… > Strip > Status stack; this is that stack, once — they
// supply only the rail, the items and the flash.
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
