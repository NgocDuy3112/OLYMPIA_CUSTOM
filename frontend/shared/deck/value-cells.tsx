import { playerCellClass, type CellWhere } from "./cells"
import { DECK_PAD, TYPE, pt } from "./geometry"

export function ValueCells({ cells, onPick }: {
    cells: Array<{ value: number; remaining: number; chosen?: number }>
    onPick?: (value: number) => void
}) {
    if (cells.length === 0) return null
    return (
        <div className="flex min-h-0 flex-1 flex-col justify-start gap-[0.9cqw]">
            <div className="grid gap-[0.9cqw]" style={{ gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))` }}>
                {cells.map((cell) => {
                    const chosen = cell.chosen ?? 0
                    const actionable = Boolean(onPick) && (chosen > 0 || cell.remaining > 0)
                    let where: CellWhere = "taken"
                    if (chosen > 0) where = "pending"
                    else if (cell.remaining > 0) where = "free"
                    const title = cell.remaining > 0
                        ? `Chọn ngẫu nhiên 1 câu ${cell.value}`
                        : `Hết câu ${cell.value}`
                    return (
                        <button
                            key={cell.value}
                            type="button"
                            disabled={!actionable}
                            onClick={actionable && onPick ? () => onPick(cell.value) : undefined}
                            title={title}
                            className={`flex-col gap-[0.3cqw] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${playerCellClass({ where, chosen: chosen > 0, actionable })}`}
                            style={DECK_PAD}
                        >
                            <b className="font-display leading-none" style={{ fontSize: pt(TYPE.value) }}>{cell.value}</b>
                            <span className="font-sans leading-none text-muted-foreground" style={{ fontSize: pt(TYPE.label) }}>
                                còn {cell.remaining}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
