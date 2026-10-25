import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { cn } from "cn"
import { DialogOverlay, DialogTitle } from "@shared/ui/dialog"
import type { TournamentRound } from "@/lib/api"
import type { Match } from "@/lib/types"
import { MatchDetail } from "./MatchDetail"

// Clicking a match opens it HERE — a sidebar over the schedule, not a new page
// (decision 2510). The schedule stays visible behind it; the URL keeps a
// `?match=` param so the view is still shareable and Back works.
// LIVE matches are the exception: they need the full page (the live screens).

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
                    <div className="flex items-start justify-between gap-3">
                        <DialogTitle className="font-heading text-lg font-semibold">
                            {match.round}
                        </DialogTitle>
                        <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                            <X className="size-4" aria-hidden />
                            <span className="sr-only">Đóng</span>
                        </DialogPrimitive.Close>
                    </div>

                    <MatchDetail match={match} rounds={rounds} variant="drawer" />
                </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    )
}
