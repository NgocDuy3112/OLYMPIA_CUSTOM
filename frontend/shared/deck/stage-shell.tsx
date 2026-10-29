import type { ReactNode } from "react"

// ── the stage canvas ─────────────────────────────────────────────────────────
/**
 * The 16:9 stage canvas every surface renders into. Regions (Header · Main ·
 * Rail · ActionBar) are laid out per the deck's coordinates inside it — the
 * geometry lives in @shared/deck/geometry (one canvas, two surfaces: the
 * portal's MC console and the gameplay app's player deck), and each surface
 * owns the match data its board is drawn from: columns come from the questions'
 * domains, rows from their point values, so any count fits.
 *
 * The old static deck (verbatim OC3.pptm canvas + demo harness with hardcoded
 * domain labels) was unreachable dead code and has been deleted — this frame
 * is all StageShell is, and all it needs to be.
 */
export function StageShell({ children }: { children: ReactNode }) {
    return (
        <div className="@container relative aspect-video w-full overflow-hidden bg-background">
            {children}
        </div>
    )
}
