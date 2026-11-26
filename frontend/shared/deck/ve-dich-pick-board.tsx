import { DECK_PAD, pt } from "./geometry"
import { CHUNG_PICK_VALUES, VE_GRID_COLUMNS, boardRows } from "./ve-dich-board"

export interface PickBoardCell {
    questionId: string
    value: number
    where: string
}

const CELL_BASE =
    "flex h-[4.43cqw] flex-col items-center justify-center rounded-lg shadow-sm ring-1 transition"

const cellTone = (where: string, picked: boolean, onPick?: (questionId: string) => void): string => {
    if (picked) return `${CELL_BASE} bg-primary text-primary-foreground ring-2 ring-primary`
    if (where === "free" && onPick) return `${CELL_BASE} cursor-pointer bg-card ring-border hover:bg-accent`
    if (where === "free") return `${CELL_BASE} bg-card ring-border`
    // rules.md §7.4: a staged pick is chosen but not yet confirmed — the dashed edge keeps it
    // apart from a free cell and from one already played.
    if (where === "pending") return `${CELL_BASE} border border-dashed border-primary bg-primary/10 text-foreground ring-primary/30`
    return `${CELL_BASE} bg-muted text-muted-foreground/40 ring-border opacity-50`
}

const cellTitle = (value: number, where: string, picked: boolean): string => {
    if (picked) return `Ô câu ${value} điểm — đã chọn`
    if (where === "free") return `Câu ${value} điểm còn trống`
    if (where === "locked") return `Chọn thí sinh trước`
    // rules.md §7.4: a staged pick is only chosen — it can still be dropped until Xác nhận.
    if (where === "pending") return `Câu ${value} điểm đã chọn — chờ xác nhận`
    return `Câu ${value} điểm đã dùng`
}

const pickTitle = (value: number): string => `Chọn câu ${value} điểm`

const dropTitle = (value: number): string => `Bỏ câu ${value} điểm`

export function VeDichPickBoard({ cells, pickedIds, values, locked, onPick }: {
    cells: PickBoardCell[]
    pickedIds: string[]
    values?: number[]
    locked?: boolean
    onPick?: (questionId: string) => void
}) {
    const bands = values ?? CHUNG_PICK_VALUES
    const playable = cells.filter((cell) => bands.includes(cell.value))
    const rows = boardRows(playable, (cell) => cell.value)
    if (rows.length === 0) return null

    return (
        <div className="flex min-h-0 flex-1 flex-col justify-start gap-[0.9cqw]">
            {rows.map((row) => (
                <div key={row.value} className="grid gap-[0.9cqw]" style={{ gridTemplateColumns: `repeat(${VE_GRID_COLUMNS}, minmax(0, 1fr))` }}>
                    {row.cells.map((cell) => {
                        const picked = pickedIds.includes(cell.questionId)
                        const dropped = Boolean(onPick) && picked
                        const pressable = Boolean(onPick) && cell.where === "free"
                        let where = cell.where
                        if (locked === true) where = "locked"
                        let title = cellTitle(cell.value, where, picked)
                        if (onPick) {
                            if (picked) title = dropTitle(cell.value)
                            else if (pressable) title = pickTitle(cell.value)
                        }
                        let disabled = !dropped && !pressable
                        if (locked === true) disabled = true
                        return (
                            <button
                                key={cell.questionId}
                                type="button"
                                disabled={disabled}
                                onClick={onPick ? () => onPick(cell.questionId) : undefined}
                                title={title}
                                className={cellTone(where, picked, onPick)}
                                style={{ ...DECK_PAD, gridColumn: `span ${row.span}` }}
                            >
                                <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                            </button>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}
