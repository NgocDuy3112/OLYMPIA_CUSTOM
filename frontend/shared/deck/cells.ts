import { CHIP_H } from "./geometry"

export type CellWhere = "free" | "pending" | "open" | "taken" | "deferred"

const CELL_SHAPE = `flex ${CHIP_H} flex-col items-center justify-center rounded-lg shadow-sm`

const CELL_STATE: Record<Exclude<CellWhere, "free">, string> = {
    pending: "bg-primary/10 text-primary ring-2 ring-primary",
    open: "bg-primary text-primary-foreground ring-1 ring-primary",
    taken: "bg-black text-white ring-1 ring-black",
    deferred: "bg-card text-muted-foreground/40 ring-1 ring-border opacity-50",
}

export function mcCellClass(where: CellWhere, faded: boolean): string {
    if (where === "free") {
        let freeTone = "bg-card ring-1 ring-border"
        if (faded) freeTone = "bg-card text-muted-foreground/40 ring-1 ring-border opacity-50"
        return `${CELL_SHAPE} ${freeTone}`
    }
    return `${CELL_SHAPE} ${CELL_STATE[where]}`
}

export function playerCellClass({ where, chosen, actionable }: {
    where: CellWhere
    chosen: boolean
    actionable: boolean
}): string {
    if (where !== "free") return `${CELL_SHAPE} ${CELL_STATE[where]} transition`
    if (chosen) return `${CELL_SHAPE} bg-primary/10 text-primary ring-2 ring-primary transition`
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
    let hoverHint = ""
    if (interactive) hoverHint = "cursor-pointer hover:ring-primary/60"
    return `${TILE} bg-card text-foreground ring-1 ring-border ${hoverHint}`
}

export function playerHintTileClass(state: HintTile): string {
    if (state === "open") return `${TILE} bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background`
    if (state === "used") return `${TILE} bg-muted text-muted-foreground/50 ring-1 ring-border`
    return `${TILE} bg-card text-foreground ring-1 ring-border`
}

export const CELL_TITLE: Record<Exclude<CellWhere, "free">, string> = {
    taken: "đã dùng",
    pending: "thí sinh đã chọn — chờ mở",
    open: "đang mở",
    deferred: "dành cho Lượt cá nhân",
}

export const cellTitleOf = (where: CellWhere): string =>
    where === "free" ? "còn trống" : CELL_TITLE[where]
