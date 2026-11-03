// The Về đích board — ONE fixed composition shared by both surfaces: twenty
// cells, no categories. 6×20, 6×30, 4×40, 4×50.
//
// The rows ARE the score bands, and the last two rows carry FEWER, WIDER cells:
// six cells of span 2 and four cells of span 3 both fill a 12-column grid, so
// every row is exactly as wide as the others and nothing looks ragged. That is
// why the span travels with the composition instead of being computed in JSX.
//
// The backend refuses to start a round whose questions are not this composition
// (engine/turns/ve-dich.ts), so a row here can never be empty in play.

export const VE_GRID_COLUMNS = 12

interface BandSpec {
    value: number
    /** How many cells this band holds. */
    count: number
    /** Columns one cell spans — count × span = VE_GRID_COLUMNS. */
    span: number
}

export const VE_BOARD: readonly BandSpec[] = [
    { value: 20, count: 6, span: 2 },
    { value: 30, count: 6, span: 2 },
    { value: 40, count: 4, span: 3 },
    { value: 50, count: 4, span: 3 },
] as const

/** The face values, top band first (20 → 50, as drawn). */
export const VE_VALUES = VE_BOARD.map((band) => band.value)

const bandOf = (value: number): BandSpec => VE_BOARD.find((band) => band.value === value) ?? {
    value,
    count: 0,
    span: 2                                   // an unforeseen value still draws
}

interface BoardRow<T> {
    value: number
    /** Columns each cell of this row spans. */
    span: number
    /** The row's cells, in board order. */
    cells: T[]
}

/**
 * Group cells into the board's rows — one row per face value, bands top-down.
 * Within a band the input order stands (the server builds the board from the
 * frozen set, so that order is stable for the console and the player alike).
 */
export function boardRows<T>(cells: readonly T[], valueOf: (cell: T) => number): Array<BoardRow<T>> {
    const byValue = new Map<number, T[]>()
    for (const cell of cells) {
        const value = valueOf(cell)
        const bucket = byValue.get(value)
        if (bucket) bucket.push(cell)
        else byValue.set(value, [cell])
    }

    const rows: Array<BoardRow<T>> = []
    for (const band of VE_BOARD) {
        const bucket = byValue.get(band.value)
        if (bucket?.length) rows.push({ value: band.value, span: band.span, cells: bucket })
        byValue.delete(band.value)
    }
    // Anything the composition does not know (an older archived state) still
    // draws, in its own row, rather than vanishing off the board.
    for (const [value, bucket] of byValue) {
        rows.push({ value, span: bandOf(value).span, cells: bucket })
    }
    return rows
}

/** The chips above the open question: this turn's OPEN + PENDING cells only —
 *  the same slice the console's card header shows, so both surfaces point at the
 *  same squares. */
export function stripCellsOf<T extends { where: string }>(board: readonly T[] | null | undefined): T[] {
    return (board ?? []).filter((cell) => cell.where === "open" || cell.where === "pending")
}
