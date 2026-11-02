// Cell + tile class tables. Every screen that draws a pickable board cell
// (the vé-đích grid: MC and player) or a giải mã hint tile asks one of these
// instead of carrying nested template literals — the states are a closed set,
// so the classes are a table, not an if-chain in JSX.

export type CellWhere = "free" | "pending" | "open" | "taken" | "deferred"

const CELL_SHAPE = "flex aspect-[133/59] flex-col items-center justify-center rounded-lg shadow-sm"

// The STATE look — identical on both surfaces: the MC's grid and the player's
// picker must read the same cell the same way.
const CELL_STATE: Record<Exclude<CellWhere, "free">, string> = {
    pending: "bg-sky-50 text-sky-800 ring-2 ring-sky-500",
    open: "bg-primary text-primary-foreground ring-1 ring-primary",
    taken: "bg-black text-white ring-1 ring-black",
    deferred: "bg-card text-muted-foreground/40 ring-1 ring-border opacity-50",
}

/**
 * The MC's grid: a status read-out — nothing is clickable here (the MC presses
 * Bắt đầu on the strip), so a free cell is plain card. `faded` marks a free
 * cell this turn may NOT pick (only the top band is open).
 */
export function mcCellClass(where: CellWhere, faded: boolean): string {
    if (where === "free") {
        return `${CELL_SHAPE} ${faded ? "bg-card text-muted-foreground/40 ring-1 ring-border opacity-50" : "bg-card ring-1 ring-border"}`
    }
    return `${CELL_SHAPE} ${CELL_STATE[where]}`
}

/**
 * The player's picker: the same cells, plus the pick affordances — `chosen`
 * (this turn's staged picks), `actionable` (free AND pickable now) and the
 * faded rest.
 */
export function playerCellClass({ where, chosen, actionable }: {
    where: CellWhere
    chosen: boolean
    actionable: boolean
}): string {
    if (where !== "free") return `${CELL_SHAPE} ${CELL_STATE[where]} transition`
    if (chosen) return `${CELL_SHAPE} bg-sky-50 text-foreground ring-2 ring-sky-500 transition`
    if (actionable) return `${CELL_SHAPE} cursor-pointer bg-card ring-1 ring-border transition hover:bg-accent`
    return `${CELL_SHAPE} cursor-default bg-card text-muted-foreground/70 ring-1 ring-border`
}

/** A free cell this turn may not pick: the "only the top band" rule, drawn. */
export const cellFaded = (where: CellWhere, pickableNow: boolean): boolean =>
    where === "deferred" || (where === "free" && !pickableNow)

// ── giải mã hint tiles ───────────────────────────────────────────────────────

/**
 * The board is EIGHT squares on both surfaces — the show's fixed grid, not the
 * round's hint count. A round with fewer hints leaves the last tiles `absent`,
 * so a viewer can never read "this round kept something back" off the layout.
 */
export const HINT_TILES = 8

const TILE = "flex aspect-[203/132] items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md"

export type HintTile = "free" | "open" | "used" | "absent"

/** The MC's tiles: free → clickable, open → the live window, used → spent,
 *  absent → this round has no hint here (inert, never a button). */
export function hintTileClass(state: HintTile, interactive: boolean): string {
    if (state === "open") return `${TILE} bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background`
    if (state === "used") return `${TILE} bg-muted text-muted-foreground/50 ring-1 ring-border`
    if (state === "absent") return `${TILE} bg-muted/40 text-muted-foreground/25 ring-1 ring-border`
    return `${TILE} bg-card text-foreground ring-1 ring-border ${interactive ? "cursor-pointer hover:ring-sky-500" : ""}`
}

/** The player's tiles are a read-out, not a picker: muted while a window runs. */
export function playerHintTileClass(windowOpen: boolean): string {
    return `${TILE} ring-1 ring-border ${windowOpen ? "bg-muted text-muted-foreground" : "bg-card text-foreground"}`
}
