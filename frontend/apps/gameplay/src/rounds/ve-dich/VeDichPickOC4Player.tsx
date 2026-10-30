import { Badges, Band, CardHeader, MainCard, Rail, StageLayout, Status, type PlayerCtx } from "@shared/deck/player-deck"
import { DECK_PAD, STRIP_R, pt } from "@shared/deck/geometry"

// Về đích — bảng chọn câu (S6 = phase 1 chọn 1 · S5 = phase 2 bốc 3): cells
// ARE the picker — a CSS grid driven by the board's own domains × values.
export function VeDichPickOC4Player({ ctx }: { ctx: PlayerCtx }) {
    const { v, myId, flash, pickedCells, setPickedCells, cmdBusy, command } = ctx
    const phase2 = ctx.stage === "phase2"
    const board = v.board ?? []
    const domains = [...new Set(board.map((cell) => cell.domain))]
    // Row-major flow: rows = values, cells left→right by domain (as drawn).
    const cells = [...board].sort(
        (a, b) => a.value - b.value || domains.indexOf(a.domain) - domains.indexOf(b.domain),
    )
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
                        const actionable = picking && cell.where === "free"
                        return (
                            <button
                                key={cell.questionId}
                                type="button"
                                disabled={!actionable}
                                aria-pressed={chosen}
                                onClick={() => toggle(cell.questionId)}
                                title={cell.where === "free" ? (picking ? "Chọn câu này" : "chưa tới lượt bạn") : cell.where === "pending" ? "đã có thí sinh chọn" : "đang mở"}
                                className={`flex aspect-[133/59] flex-col items-center justify-center rounded-lg shadow-sm ring-1 transition ${
                                    cell.where === "open"
                                        ? "bg-primary text-primary-foreground ring-primary"
                                        : cell.where === "pending"
                                          ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
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
