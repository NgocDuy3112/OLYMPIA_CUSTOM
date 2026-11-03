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
        // The deck sits CENTRED in the space it is given, and as LARGE as that
        // space allows in BOTH directions — "contain", like an image, which CSS
        // cannot do for a plain box (aspect-ratio + max-height squashes the ratio
        // instead of shrinking the width).
        //
        // Which side drives the size flips with the WINDOW's shape, not with a
        // measurement: a wide window is short of height, a tall one is short of
        // width. (Container query units cannot do this — `cqh` reads 0 when the
        // container's height comes from `flex-1`, which is exactly our case.)
        //
        // `100dvh` was the earlier yardstick and it is the wrong one: on a zoomed
        // page, under mobile browser chrome, or inside an embedded frame it is not
        // the height on screen, and the deck sized itself off it and collapsed to
        // a postage stamp.
        //
        // PORTRAIT PHONES are the open case: a 16:9 deck on a 390 px screen is a
        // 219 px strip, centred but small — the text is drawn in `cqw` off a 390 px
        // width, so it is not the size that is wrong, the LAYOUT is. A phone wants
        // its own deck (stacked regions, portrait proportions), not this canvas
        // letterboxed. Deferred on purpose; the contain rule above keeps the
        // projector and the laptop correct until then.
        <div className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-background">
            <div
                className="relative aspect-video h-auto w-full overflow-hidden bg-background [@media(min-aspect-ratio:16/9)]:h-full [@media(min-aspect-ratio:16/9)]:w-auto"
            >
                <div className="@container relative h-full w-full overflow-hidden">{children}</div>
            </div>
        </div>
    )
}
