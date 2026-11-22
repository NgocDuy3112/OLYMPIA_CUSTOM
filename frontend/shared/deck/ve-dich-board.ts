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

export type TurnChipState = "open" | "waiting" | "done"

export interface TurnChip {
    questionId: string
    value: number
    where: TurnChipState
}

/**
 * Every question picked for the turn, in pick order, whatever its state.
 * `turnQuestions` is the turn's record; the board only says which one is open.
 * Falls back to the board's open/pending cells for older frames.
 */
export function turnChipsOf(input: {
    turnQuestions?: string[] | null
    turnValues?: number[] | null
    board?: ReadonlyArray<{ questionId: string; value: number; where: string }> | null
    openId: string | null
}): TurnChip[] {
    const board = input.board ?? []
    const whereOf = (questionId: string): TurnChipState => {
        if (questionId === input.openId) return "open"
        const cell = board.find((c) => c.questionId === questionId)
        if (cell?.where === "pending") return "waiting"
        if (!cell) return "waiting"
        return "done"
    }
    const ids = input.turnQuestions ?? []
    const values = input.turnValues ?? []
    if (ids.length > 0) {
        return ids.map((questionId, index) => ({
            questionId,
            value: values[index] ?? board.find((c) => c.questionId === questionId)?.value ?? 0,
            where: whereOf(questionId),
        }))
    }
    return stripCellsOf(board).map((cell) => ({
        questionId: cell.questionId,
        value: cell.value,
        where: whereOf(cell.questionId),
    }))
}

export function turnChipHint(where: TurnChipState, value: number): string {
    if (where === "open") return `Câu ${value} đang mở`
    if (where === "done") return `Mở lại câu ${value} điểm`
    return `Mở câu ${value} điểm`
}

/**
 * The player sees the same strip as the console: every question of the turn,
 * the open one highlighted. Read-only — players never switch questions.
 */
export function playerTurnChips(view: {
    board?: ReadonlyArray<{ questionId: string; value: number; where: string }> | null
    open?: ReadonlyArray<{ questionId: string }>
    console?: { turnQuestions?: string[]; turnValues?: number[] } | null
}): Array<{ id: string; label: string; active: boolean; title: string }> {
    const chips = turnChipsOf({
        turnQuestions: view.console?.turnQuestions ?? null,
        turnValues: view.console?.turnValues ?? null,
        board: view.board ?? null,
        openId: view.open?.[0]?.questionId ?? null,
    })
    return chips.map((chip) => ({
        id: chip.questionId,
        label: String(chip.value),
        active: chip.where === "open",
        title: turnChipHint(chip.where, chip.value),
    }))
}
