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
     * Fill the viewport instead of holding 16:9 — for a FORM (the login door a
     * stuck player is sent to), which is opened on a phone and is not a deck at all.
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
        // CONTAIN, exactly: the canvas is as large as this box allows in BOTH
        // directions, and never larger. The shell is a size container and the
        // canvas is `min(100cqw, 100cqh * 16/9)` — one rule, no breakpoints, no
        // viewport units. (This is the one thing CSS cannot do for a plain div:
        // `aspect-ratio` + `max-height` squashes the ratio instead of shrinking the
        // width, measured 600×300 from a 16:9 box.)
        //
        // It only works because the height chain is DEFINITE — app shell `h-dvh`,
        // main `flex-1 min-h-0`, this shell `flex-1`. With `min-h-dvh` up there,
        // `cqh` reads 0 and the canvas collapses to nothing.
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
        // letterboxed. Deferred on purpose; the contain rule keeps the projector
        // and the laptop correct until then.
        <div
            className="relative flex w-full flex-1 items-center justify-center overflow-hidden bg-background"
            style={{ containerType: "size" }}
        >
            <div
                className="relative aspect-video overflow-hidden bg-background"
                style={{ width: "min(100cqw, calc(100cqh * 16 / 9))" }}
            >
                <div className="@container relative h-full w-full overflow-hidden">{children}</div>
            </div>
        </div>
    )
}
