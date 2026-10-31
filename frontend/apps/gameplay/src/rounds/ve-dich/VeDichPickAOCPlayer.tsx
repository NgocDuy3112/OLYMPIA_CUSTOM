import { Badges, Band, CardHeader, MainCard, Rail, StageLayout, Status, type PlayerCtx } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"
import { sortVeCells } from "@shared/deck/ve-dich-board"

// Về đích — bảng chọn câu (S6 = phase 1 chọn 1 · S5 = phase 2 bốc 3): cells
// ARE the picker — a CSS grid driven by the board's own domains × values.
export function VeDichPickAOCPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, myId, flash, pickedCells, setPickedCells, cmdBusy, command } = ctx
    const phase2 = ctx.stage === "phase2"
    const board = v.board ?? []
    // The fixed matrix: canonical domains × score bands (20 → 50, as drawn).
    const cells = sortVeCells(board, (cell) => cell.domain, (cell) => cell.value)
    const domains = [...new Set(cells.map((cell) => cell.domain))]
    // Chung: only the TOP free band is pickable this turn — everything lower fades.
    const maxFree = Math.max(-1, ...cells.filter((c) => c.where === "free").map((c) => c.value))
    const pending = new Set(v.me.pendingPicks ?? [])
    const picking = v.me.isMyTurn === true && pending.size === 0
    const need = phase2 ? 3 : 1

    const toggle = (id: string) => {
        if (!picking) return
        setPickedCells((current) => {
            if (current.includes(id)) return current.filter((x) => x !== id)
            if (!phase2) return [id]
            return current.length >= 3 ? current : [...current, id]
        })
    }
    const confirm = () => {
        if (phase2 && pickedCells.length === 3) command({ type: "pickBatch", questionIds: pickedCells })
        if (!phase2 && pickedCells.length === 1) command({ type: "pick", questionId: pickedCells[0] })
    }

    return (
        <StageLayout rail={<Rail variant={phase2 ? "compact" : "answers"} view={v} myId={myId} />}>
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
                        const faded = cell.where === "deferred"
                            || (cell.where === "free" && !pickableNow)
                        return (
                            <button
                                key={cell.questionId}
                                type="button"
                                disabled={!actionable}
                                aria-pressed={chosen}
                                onClick={() => toggle(cell.questionId)}
                                title={
                                    cell.where === "free"
                                        ? !picking
                                            ? "chưa tới lượt bạn"
                                            : actionable
                                                ? "Chọn câu này"
                                                : "lượt này không chọn được"
                                        : cell.where === "pending" ? "đã có thí sinh chọn"
                                        : cell.where === "open" ? "đang mở"
                                        : cell.where === "deferred" ? "dành cho Lượt cá nhân"
                                        : "đã dùng"
                                }
                                className={`flex aspect-[133/59] flex-col items-center justify-center rounded-lg shadow-sm ring-1 transition ${
                                    cell.where === "open"
                                        ? "bg-primary text-primary-foreground ring-primary"
                                        : cell.where === "pending"
                                          ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
                                        : cell.where === "taken"
                                          ? "bg-black text-white ring-black"
                                        : faded
                                          ? "cursor-default bg-card text-muted-foreground/40 ring-border opacity-50"
                                          : chosen
                                            ? "bg-sky-50 ring-2 ring-sky-500 text-foreground"
                                            : actionable
                                              ? "cursor-pointer bg-card ring-border hover:bg-accent"
                                              : "cursor-default bg-card text-muted-foreground/70 ring-border"
                                }`}
                                style={DECK_PAD}
                            >
                                <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{cell.domain}</span>
                                <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                            </button>
                        )
                    })}
                </div>
            </MainCard>
            <Band>
                <span className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                    {!picking
                        ? pending.size > 0
                          ? `Đã chốt ${pending.size} câu — chờ MC mở`
                          : v.me.isMyTurn
                            ? "Đến lượt bạn!"
                            : "Đến lượt thí sinh khác"
                        : pickedCells.length > 0
                          ? `Đã chọn ${pickedCells.length}/${need}`
                          : phase2 ? "Chọn 3 câu trên bảng" : "Chọn một câu trên bảng"}
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
            </Band>
            <Status error={flash} hint={picking ? "bấm Ô để chọn" : undefined} />
        </StageLayout>
    )
}
