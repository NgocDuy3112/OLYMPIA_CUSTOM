import { DECK_PAD, pt } from "./geometry"
import { VE_GRID_COLUMNS, boardRows } from "./ve-dich-board"

export interface PickBoardCell {
    questionId: string
    value: number
    where: string
}

const PICK_VALUES = [20, 30]

const CELL_BASE =
    "flex h-[4.43cqw] flex-col items-center justify-center rounded-lg shadow-sm ring-1 transition"

const cellTone = (where: string, picked: boolean, onPick?: (questionId: string) => void): string => {
    if (picked) return `${CELL_BASE} bg-primary text-primary-foreground ring-2 ring-primary`
    if (where === "free" && onPick) return `${CELL_BASE} cursor-pointer bg-card ring-border hover:bg-accent`
    if (where === "free") return `${CELL_BASE} bg-card ring-border`
    return `${CELL_BASE} bg-muted text-muted-foreground/40 ring-border opacity-50`
}

const cellTitle = (value: number, where: string, picked: boolean): string => {
    if (picked) return `Câu ${value} điểm đã được chọn`
    if (where === "free") return `Câu ${value} điểm còn trống`
    return `Câu ${value} điểm đã dùng`
}

const pickTitle = (value: number): string => `Chọn câu ${value} điểm`

const dropTitle = (value: number): string => `Bỏ câu ${value} điểm`

export function VeDichPickBoard({ cells, pickedIds, onPick }: {
    cells: PickBoardCell[]
    pickedIds: string[]
    onPick?: (questionId: string) => void
}) {
    const playable = cells.filter((cell) => PICK_VALUES.includes(cell.value))
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
                        let title = cellTitle(cell.value, cell.where, picked)
                        if (onPick) {
                            if (picked) title = dropTitle(cell.value)
                            else if (pressable) title = pickTitle(cell.value)
                        }
                        return (
                            <button
                                key={cell.questionId}
                                type="button"
                                disabled={!dropped && !pressable}
                                onClick={onPick ? () => onPick(cell.questionId) : undefined}
                                title={title}
                                className={cellTone(cell.where, picked, onPick)}
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
