import { Badges, MainCard, Rail, Status, Band, Box, type PlayerCtx } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"

// Về đích — bảng chọn câu (S6 = phase 1 chọn 1 · S5 = phase 2 bốc 3): cells
// ARE the picker. Pure: every value comes from the orchestrator's PlayerCtx.
export function VeDichPickPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, myId, flash, pickedCells, setPickedCells, cmdBusy, command } = ctx
    const phase2 = ctx.stage === "phase2"
    const board = v.board ?? []
    const domains = [...new Set(board.map((cell) => cell.domain))]
    const values = [...new Set(board.map((cell) => cell.value))].sort((a, b) => a - b)
    // Data-driven grid: any domains/values count fits — stride shrinks
    // beyond the classic 6×4; geometry at 6×4 is exactly the deck's.
    const stepX = domains.length > 1 ? Math.min(1.49, 7.45 / (domains.length - 1)) : 1.49
    const stepY = values.length > 1 ? Math.min(0.74, 2.22 / (values.length - 1)) : 0.74
    const cellW = Math.min(1.33, stepX - 0.16)
    const cellH = Math.min(0.59, stepY - 0.15)
    const colX = (i: number) => 0.54 + i * stepX
    const rowY = (r: number) => 1.57 + r * stepY
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
        <>
            <MainCard h={4.24}>
                <Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} />
                {board.map((cell) => {
                    const ci = domains.indexOf(cell.domain)
                    const ri = values.indexOf(cell.value)
                    if (ci < 0 || ri < 0) return null
                    const chosen = pickedCells.includes(cell.questionId)
                    const actionable = picking && cell.where === "free"
                    return (
                        <Box
                            key={cell.questionId}
                            x={colX(ci)} y={rowY(ri)} w={cellW} h={cellH}
                            onClick={actionable ? () => toggle(cell.questionId) : undefined}
                            title={cell.where === "free" ? (picking ? "Chọn câu này" : "chưa tới lượt bạn") : cell.where === "pending" ? "đã có thí sinh chọn" : "đang mở"}
                            className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 transition ${
                                cell.where === "open"
                                    ? "bg-primary text-primary-foreground ring-primary"
                                    : cell.where === "pending"
                                      ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
                                      : chosen
                                        ? "bg-sky-50 ring-2 ring-sky-500 text-foreground"
                                        : actionable
                                          ? "bg-card ring-border cursor-pointer hover:bg-accent"
                                          : "bg-card text-muted-foreground/70 ring-border"
                            }`}
                            style={DECK_PAD}
                        >
                            <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{cell.domain}</span>
                            <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                        </Box>
                    )
                })}
            </MainCard>
            <Rail variant={phase2 ? "compact" : "answers"} view={v} myId={myId} />
            <Band slide={56}>
                <span className="flex h-full items-center rounded-lg bg-muted px-3 font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
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
                    className="flex h-full min-h-[1.9em] items-center rounded-lg bg-primary px-4 font-sans text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                    style={{ borderRadius: STRIP_R }}
                >
                    {cmdBusy ? "Đang chốt…" : phase2 ? `Chốt ${need} câu` : "Chọn câu này"}
                </button>
            </Band>
            <Status y={5.44} error={flash} hint={picking ? "bấm Ô để chọn" : undefined} />
        </>
    )
}
