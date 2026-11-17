import { playerCellClass } from "./cells"
import { DECK_PAD, pt } from "./geometry"

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
                    const where = chosen > 0 ? "pending" : cell.remaining > 0 ? "free" : "taken"
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
                            className={`flex-col gap-[0.3cqw] ${playerCellClass({ where, chosen: chosen > 0, actionable })}`}
                            style={DECK_PAD}
                        >
                            <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                            <span className="font-sans leading-none text-muted-foreground" style={{ fontSize: pt(11) }}>
                                còn {cell.remaining}
                            </span>
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
