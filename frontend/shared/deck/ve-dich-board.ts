export const VE_GRID_COLUMNS = 12

interface BandSpec {
    value: number
    count: number
    span: number
}

export const VE_BOARD: readonly BandSpec[] = [
    { value: 20, count: 6, span: 2 },
    { value: 30, count: 6, span: 2 },
    { value: 40, count: 4, span: 3 },
    { value: 50, count: 4, span: 3 },
] as const

export const VE_VALUES = VE_BOARD.map((band) => band.value)

const bandOf = (value: number): BandSpec => VE_BOARD.find((band) => band.value === value) ?? {
    value,
    count: 0,
    span: 2                                   
}

interface BoardRow<T> {
    value: number
    span: number
    cells: T[]
}

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
    for (const [value, bucket] of byValue) {
        rows.push({ value, span: bandOf(value).span, cells: bucket })
    }
    return rows
}

export function stripCellsOf<T extends { where: string }>(board: readonly T[] | null | undefined): T[] {
    return (board ?? []).filter((cell) => cell.where === "open" || cell.where === "pending")
}
