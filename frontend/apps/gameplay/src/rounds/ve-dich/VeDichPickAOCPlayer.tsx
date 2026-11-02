import { Badges, CardHeader, MainCard, PlayerStage, Rail, type PlayerCore } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"
import { playerCellClass, type CellWhere } from "@shared/deck/cells"
import { sortVeCells } from "@shared/deck/ve-dich-board"
import type { VeDichCommand } from "@shared/deck/types"

// Về đích — bảng chọn câu (S6 = phase 1 chọn 1 · S5 = phase 2 bốc 3): cells
// ARE the picker — a CSS grid driven by the board's own domains × values.
// (This screen replaces the standard band/status pair with its own footer, so
// it composes PlayerStage's frame pieces directly.)
export type VeDichPickPlayerCtx = PlayerCore & {
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
function turnLabel(ctx: VeDichPickPlayerCtx, phase2: boolean, need: number): string {
    if (ctx.v.me.isMyTurn !== true) return "Đến lượt thí sinh khác"
    if ((ctx.v.me.pendingPicks ?? []).length > 0) return `Đã chốt ${ctx.v.me.pendingPicks?.length} câu — chờ MC mở`
    if (ctx.pickedCells.length > 0) return `Đã chọn ${ctx.pickedCells.length}/${need}`
    return phase2 ? `Chọn ${need} câu trên bảng` : "Chọn một câu trên bảng"
}

export function VeDichPickAOCPlayer({ ctx }: { ctx: VeDichPickPlayerCtx }) {
    const { v, myId, flash, pickedCells, setPickedCells, cmdBusy, command } = ctx
    const phase2 = ctx.stage === "phase2"
    const cells = sortVeCells(v.board ?? [], (cell) => cell.domain, (cell) => cell.value)
    const domains = [...new Set(cells.map((cell) => cell.domain))]
    // Chung: only the TOP free band is pickable this turn — everything lower fades.
    const maxFree = Math.max(-1, ...cells.filter((c) => c.where === "free").map((c) => c.value))
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
                        {!picking && pending.size > 0 ? `Đã chốt ${pending.size} câu — chờ MC mở` : turnLabel(ctx, phase2, need)}
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
                <div
                    className="grid min-h-0 flex-1 content-start justify-start gap-[0.9cqw]"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, domains.length)}, minmax(0, 10cqw))` }}
                >
                    {cells.map((cell) => {
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
                                className={playerCellClass({
                                    where: cell.where,
                                    chosen,
                                    actionable,
                                })}
                                style={DECK_PAD}
                            >
                                <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{cell.domain}</span>
                                <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                            </button>
                        )
                    })}
                </div>
            </MainCard>
        </PlayerStage>
    )
}
