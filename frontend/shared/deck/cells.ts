export type CellWhere = "free" | "pending" | "open" | "taken" | "deferred"

const CELL_SHAPE = "flex h-[4.43cqw] flex-col items-center justify-center rounded-lg shadow-sm"

const CELL_STATE: Record<Exclude<CellWhere, "free">, string> = {
    pending: "bg-sky-50 text-sky-800 ring-2 ring-sky-500",
    open: "bg-primary text-primary-foreground ring-1 ring-primary",
    taken: "bg-black text-white ring-1 ring-black",
    deferred: "bg-card text-muted-foreground/40 ring-1 ring-border opacity-50",
}

export function mcCellClass(where: CellWhere, faded: boolean): string {
    if (where === "free") {
        return `${CELL_SHAPE} ${faded ? "bg-card text-muted-foreground/40 ring-1 ring-border opacity-50" : "bg-card ring-1 ring-border"}`
    }
    return `${CELL_SHAPE} ${CELL_STATE[where]}`
}

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


export const HINT_TILES = 8

const TILE = "flex items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md"

export type HintTile = "free" | "open" | "used" | "absent"

export function hintTileClass(state: HintTile, interactive: boolean): string {
    if (state === "open") return `${TILE} bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background`
    if (state === "used") return `${TILE} bg-muted text-muted-foreground/50 ring-1 ring-border`
    if (state === "absent") return `${TILE} bg-muted/40 text-muted-foreground/25 ring-1 ring-border`
    return `${TILE} bg-card text-foreground ring-1 ring-border ${interactive ? "cursor-pointer hover:ring-sky-500" : ""}`
}

export function playerHintTileClass(windowOpen: boolean): string {
    return `${TILE} ring-1 ring-border ${windowOpen ? "bg-muted text-muted-foreground" : "bg-card text-foreground"}`
}
