import { Badges, CardHeader, MainCard, PlayerStage, Rail, type PlayerCore } from "../player-deck"
import { DECK_PAD, STRIP_R, pt } from "../geometry"
import { playerCellClass, type CellWhere } from "../cells"
import { VE_GRID_COLUMNS, boardRows } from "../ve-dich-board"
import type { VeDichCommand } from "../types"

// Về đích — bảng chọn câu (S6 = phase 1 chọn 1 · S5 = phase 2 bốc 3): the cells
// ARE the picker. The board is the show's — 6×20, 6×30, 4×40, 4×50 — rows are
// the bands and the higher bands are wider (span 3 of 12), so the grid stays
// balanced without any category columns.
type VeDichPickPlayerCtx = PlayerCore & {
    pickedCells: string[]
    setPickedCells: (update: (current: string[]) => string[]) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}

const NEED_PER_PHASE = { 1: 1, 2: 3 } as const

/** The picker's own title text, keyed by what the player may do right now. */
function cellTitle(where: CellWhere, picking: boolean, actionable: boolean): string {
    if (where !== "free") {
        if (where === "pending") return "đã có thí sinh chọn"
        if (where === "open") return "đang mở"
        if (where === "deferred") return "dành cho Lượt cá nhân"
        return "đã dùng"
    }
    if (!picking) return "chưa tới lượt bạn"
    return actionable ? "Chọn câu này" : "lượt này không chọn được"
}

/** The band's status line, keyed by turn state. */
function turnLabel(v: { pendingPicks?: string[]; isMyTurn?: boolean }, picked: number, phase2: boolean, need: number): string {
    if (v.isMyTurn !== true) return "Đến lượt thí sinh khác"
    if ((v.pendingPicks ?? []).length > 0) return `Đã chốt ${v.pendingPicks?.length} câu — chờ điều hành mở`
    if (picked > 0) return `Đã chọn ${picked}/${need}`
    return phase2 ? `Chọn ${need} câu trên bảng` : "Chọn một câu trên bảng"
}

export function VeDichPickAOCPlayer({ ctx }: { ctx: VeDichPickPlayerCtx }) {
    const { v, myId, flash, pickedCells, setPickedCells, cmdBusy, command } = ctx
    const phase2 = ctx.stage === "phase2"
    const board = v.board ?? []
    const rows = boardRows(board, (cell) => cell.value)
    // Chung: only the TOP free band is pickable this turn — everything lower fades.
    const maxFree = Math.max(-1, ...board.filter((c) => c.where === "free").map((c) => c.value))
    const pending = new Set(v.me.pendingPicks ?? [])
    const picking = v.me.isMyTurn === true && pending.size === 0
    const need = phase2 ? NEED_PER_PHASE[2] : NEED_PER_PHASE[1]

    const toggle = (id: string) => {
        if (!picking) return
        setPickedCells((current) => {
            if (current.includes(id)) return current.filter((x) => x !== id)
            if (!phase2) return [id]
            return current.length >= need ? current : [...current, id]
        })
    }
    const confirm = () => {
        if (phase2 && pickedCells.length === need) command({ type: "pickBatch", questionIds: pickedCells })
        if (!phase2 && pickedCells.length === need) command({ type: "pick", questionId: pickedCells[0] })
    }

    return (
        <PlayerStage
            rail={<Rail variant={phase2 ? "compact" : "answers"} view={v} myId={myId} />}
            band={
                <>
                    <span className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                        {!picking && pending.size > 0
                            ? `Đã chốt ${pending.size} câu — chờ điều hành mở`
                            : turnLabel(v.me, pickedCells.length, phase2, need)}
                    </span>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={cmdBusy || pickedCells.length !== need}
                        className="flex h-[3.3cqw] items-center rounded-lg bg-primary px-[1.6cqw] font-sans text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                        style={{ borderRadius: STRIP_R }}
                    >
                        {cmdBusy ? "Đang chốt…" : phase2 ? `Chốt ${need} câu` : "Chọn câu này"}
                    </button>
                </>
            }
            hint={picking ? "bấm Ô để chọn" : undefined}
            flash={flash}
        >
            <MainCard>
                <CardHeader left={<Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} />} />
                <div className="flex min-h-0 flex-1 flex-col justify-start gap-[0.9cqw]">
                    {rows.map((row) => (
                        <div
                            key={row.value}
                            className="grid gap-[0.9cqw]"
                            style={{ gridTemplateColumns: `repeat(${VE_GRID_COLUMNS}, minmax(0, 1fr))` }}
                        >
                            {row.cells.map((cell) => {
                                const chosen = pickedCells.includes(cell.questionId)
                                const pickableNow = phase2 || cell.value === maxFree
                                const actionable = picking && cell.where === "free" && pickableNow
                                return (
                                    <button
                                        key={cell.questionId}
                                        type="button"
                                        disabled={!actionable}
                                        aria-pressed={chosen}
                                        onClick={() => toggle(cell.questionId)}
                                        title={cellTitle(cell.where, picking, actionable)}
                                        className={playerCellClass({ where: cell.where, chosen, actionable })}
                                        style={{ ...DECK_PAD, gridColumn: `span ${row.span}` }}
                                    >
                                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </MainCard>
        </PlayerStage>
    )
}
