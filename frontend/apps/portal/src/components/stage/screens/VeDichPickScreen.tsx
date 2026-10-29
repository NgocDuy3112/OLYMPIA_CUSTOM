import { Box, Badges, MainCard, Rail, Status, Strip, type DeckCtx } from "../deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"

// Về đích — bảng chọn câu (S5 = phase 2 bốc 3 câu · S6 = phase 1 chọn 1 câu).
// No question is open; the grid is data-driven: columns = the frozen set's
// domains, rows = its point values; beyond the classic 6×4 the stride (and then
// the cell) shrinks. Pure: everything comes from DeckCtx.
export function VeDichPickScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, roundEnded, started, questions, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection
    const phase2 = mcVeDich?.phase === 2

    // ── the board ─────────────────────────────────────────────────────────────
    const boardQs = questions.filter((q) => q.roundId === "ve-dich").sort((a, b) => a.position - b.position)
    const cols = [...new Set(boardQs.map((q) => q.domain ?? ""))]
    const vals = [...new Set(boardQs.map((q) => q.points))].sort((a, b) => a - b)
    const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
    const stepX = cols.length > 1 ? Math.min(1.49, 7.45 / (cols.length - 1)) : 1.49
    const stepY = vals.length > 1 ? Math.min(0.74, 2.22 / (vals.length - 1)) : 0.74
    const cellW = Math.min(1.33, stepX - 0.16)
    const cellH = Math.min(0.59, stepY - 0.15)
    const colX = (i: number) => 0.54 + i * stepX
    const rowY = (r: number) => 1.57 + r * stepY

    const boardHint = !started
        ? undefined
        : phase2
            ? mcVeDich?.pendingQuestionId
                ? "có câu chờ mở"
                : "chờ thí sinh chọn 3 câu"
            : mcVeDich?.turnPlayerId
                ? "chờ thí sinh chọn câu"
                : "hết lượt — chuyển phase"

    return (
        <>
            <MainCard h={4.24}>
                <Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} onRoundClick={openRounds} />
                {boardQs.map((q) => {
                    const ci = cols.indexOf(q.domain ?? "")
                    const ri = vals.indexOf(q.points)
                    if (ci < 0 || ri < 0) return null
                    const where = boardMap.get(q._id) ?? "taken"
                    return (
                        <Box
                            key={q._id}
                            x={colX(ci)} y={rowY(ri)} w={cellW} h={cellH}
                            title={where === "taken" ? "đã dùng" : where === "pending" ? "thí sinh đã chọn — chờ mở" : where === "open" ? "đang mở" : "còn trống"}
                            className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${where === "open"
                                    ? "bg-primary text-primary-foreground ring-primary"
                                    : where === "pending"
                                        ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
                                        : where === "free"
                                            ? "bg-card ring-border"
                                            : "bg-muted text-muted-foreground/50 ring-border"
                                }`}
                            style={DECK_PAD}
                        >
                            <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{q.domain}</span>
                            <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{q.points}</b>
                        </Box>
                    )
                })}
            </MainCard>
            <Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} />
            <Strip
                layout="ve-dich-pick"
                items={[
                    {
                        label: "Bắt đầu",
                        onClick: started
                            ? phase2
                                ? () => ctx.send({ kind: "ve-dich.openQuestion", questionId: mcVeDich?.pendingQuestionId ?? "" })
                                : () => ctx.send({ kind: "ve-dich.beginPhase2" })
                            : undefined,
                    },
                    {
                        label: "Chọn lại",
                        onClick: started && !roundEnded
                            ? () =>
                                mcVeDich && mcVeDich.turnPlayerId === null && mcVeDich.phase === 1
                                    ? ctx.send({ kind: "ve-dich.beginPhase2" })
                                    : ctx.send({ kind: "ve-dich.advanceTurn" })
                            : undefined,
                    },
                    { label: "Về sảnh", onClick: started ? ctx.ketThuc : undefined },
                ]}
            />
            <Status y={5.44} error={flash} hint={boardHint} />
        </>
    )
}
