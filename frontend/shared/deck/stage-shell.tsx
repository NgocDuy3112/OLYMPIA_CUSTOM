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
     * Fill the viewport instead of holding 16:9. The decks never set it — a deck
     * is drawn for a projector. The player's PIN door does: it is a FORM, opened
     * on a phone in a player's hand, and a 16:9 canvas on a 390 px screen is a
     * 219 px letterbox that clips the card.
     */
    fullHeight = false,
}: {
    children: ReactNode
    fullHeight?: boolean
}) {
    return (
        <div
            className={`@container relative w-full overflow-hidden bg-background ${fullHeight ? "min-h-dvh" : "aspect-video"}`}
        >
            {children}
        </div>
    )
}
