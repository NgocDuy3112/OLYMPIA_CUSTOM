import { Badges, CardHeader, MainCard, PlayerStage, Rail, type PlayerCore } from "../player-deck"
import { DECK_PAD, STRIP_R, pt } from "../geometry"
import { mcCellClass, type CellWhere } from "../cells"
import { VE_GRID_COLUMNS, boardRows } from "../ve-dich-board"

// Về đích — bảng chọn câu (S6 = phase 1 · S5 = phase 2): the CONSOLE picks for
// the player whose turn it is (prod parity — the desk drives the board), so this
// screen is DISPLAY-ONLY: it shows the show's grid, whose turn it is, and what
// has been staged — the cells are never clickable here. The board is the show's —
// 6×20, 6×30, 4×40, 4×50 — rows are the bands and the higher bands are wider
// (span 3 of 12), so the grid stays balanced without any category columns.
type VeDichPickPlayerCtx = PlayerCore

/** What a cell says — the console's words; free cells note the top-band rule. */
const CELL_TITLE: Record<Exclude<CellWhere, "free">, string> = {
    taken: "đã dùng",
    pending: "thí sinh đã chọn — chờ mở",
    open: "đang mở",
    deferred: "dành cho Lượt cá nhân",
}

/** The status line, keyed by turn state — the picking itself happens upstairs. */
function boardLabel(v: { pendingPicks?: string[]; isMyTurn?: boolean }, phase2: boolean, need: number): string {
    const pending = (v.pendingPicks ?? []).length
    if (pending > 0) return `Đã chốt ${pending} câu — chờ điều hành mở`
    if (v.isMyTurn !== true) return "Đến lượt thí sinh khác"
    return phase2 ? `Đến lượt bạn — điều hành bốc ${need} câu` : "Đến lượt bạn — điều hành chọn câu"
}

export function VeDichPickAOCPlayer({ ctx }: { ctx: VeDichPickPlayerCtx }) {
    const { v, myId, flash } = ctx
    const phase2 = ctx.stage === "phase2"
    const board = v.board ?? []
    const rows = boardRows(board, (cell) => cell.value)
    // Chung: only the TOP free band is in play this turn — everything lower fades.
    const maxFree = Math.max(-1, ...board.filter((c) => c.where === "free").map((c) => c.value))
    const need = phase2 ? 3 : 1

    return (
        <PlayerStage
            rail={<Rail variant={phase2 ? "compact" : "answers"} view={v} myId={myId} />}
            band={
                <span
                    className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border"
                    style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                >
                    {boardLabel(v.me, phase2, need)}
                </span>
            }
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
                                const where = cell.where
                                const faded = where === "deferred" || (where === "free" && cell.value < maxFree)
                                const title = where === "free"
                                    ? faded ? "lượt này không chọn được" : "còn trống"
                                    : CELL_TITLE[where]
                                return (
                                    <div
                                        key={cell.questionId}
                                        title={title}
                                        className={mcCellClass(where, faded)}
                                        style={{ ...DECK_PAD, gridColumn: `span ${row.span}` }}
                                    >
                                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </MainCard>
        </PlayerStage>
    )
}
