import type { ReactNode } from "react"

// ── the stage canvas ─────────────────────────────────────────────────────────
/**
 * The 16:9 stage canvas every surface renders into. Regions (Header · Main ·
 * Rail · ActionBar) are laid out per the deck's coordinates inside it — the
 * geometry lives in @shared/deck/geometry (one canvas, two surfaces: the
 * portal's console and the gameplay app's player deck), and each surface
 * owns the match data its board is drawn from: columns come from the questions'
 * domains, rows from their point values, so any count fits.
 *
 * The old static deck (verbatim OC3.pptm canvas + demo harness with hardcoded
 * domain labels) was unreachable dead code and has been deleted — this frame
 * is all StageShell is, and all it needs to be.
 */
export function StageShell({
    children,
    /**
     * Fill the viewport instead of holding 16:9 — for a FORM (the player's PIN
     * door), which is opened on a phone and is not a deck at all.
     */
    fullHeight = false,
}: {
    children: ReactNode
    fullHeight?: boolean
}) {
    if (fullHeight) {
        return (
            <div className="@container relative min-h-dvh w-full overflow-hidden bg-background">
                {children}
            </div>
        )
    }

    return (
        // The deck sits CENTRED in the space it is given, not pinned to the top:
        // a 16:9 canvas on a portrait phone is a 219 px strip, and leaving 600 px
        // of empty page under it reads as a broken page. `flex-1` lets the shell
        // fill whatever the layout hands it (the app shell's main, the console's
        // stage page); `max-w` keeps the canvas inside the viewport's height, so
        // a short window letterboxes instead of overflowing.
        <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-background">
            <div className="@container relative aspect-video w-full max-w-[min(100%,calc(100dvh*16/9))] overflow-hidden bg-background">
                {children}
            </div>
        </div>
    )
}
