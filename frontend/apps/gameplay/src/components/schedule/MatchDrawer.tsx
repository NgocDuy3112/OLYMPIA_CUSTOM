import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { cn } from "cn"
import { DialogOverlay } from "@shared/ui/dialog"
import type { TournamentRound } from "@/lib/api"
import type { Match } from "@/lib/types"
import { MatchDetail } from "./MatchDetail"

// Clicking a match opens it HERE — a sidebar over the schedule, not a new page

interface MatchDrawerProps {
    match: Match | null
    rounds: TournamentRound[]
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function MatchDrawer({ match, rounds, open, onOpenChange }: MatchDrawerProps) {
    if (!match) return null

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogOverlay />
                <DialogPrimitive.Popup
                    className={cn(
                        "fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col overflow-y-auto bg-popover p-6 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-200 outline-none",
                        "data-open:animate-in data-open:fade-in-0 data-open:slide-in-from-right",
                        "data-closed:animate-out data-closed:fade-out-0 data-closed:slide-out-to-right"
                    )}
                >
                    <MatchDetail match={match} rounds={rounds} variant="drawer" />
                </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
