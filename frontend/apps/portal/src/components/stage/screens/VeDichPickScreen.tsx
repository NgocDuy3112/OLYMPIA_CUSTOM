import { Badges, CardHeader, MainCard, Rail, StageLayout, Status, Strip, type DeckCtx } from "../deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"

// Về đích — bảng chọn câu (S5 = phase 2 bốc 3 câu · S6 = phase 1 chọn 1 câu).
// No question is open; the grid is a CSS grid driven by the frozen set —
// columns = domains, rows follow from the count; any size fits, none clipped.
export function VeDichPickScreen({ ctx }: { ctx: DeckCtx }) {
    const { v, roundEnded, started, questions, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection
    const phase2 = mcVeDich?.phase === 2

    const boardQs = questions.filter((q) => q.roundId === "ve-dich").sort((a, b) => a.position - b.position)
    const cols = [...new Set(boardQs.map((q) => q.domain ?? ""))]
    const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
    // The grid flows row-major: rows = point values, cells left→right by domain.
    const cells = [...boardQs].sort(
        (a, b) => a.points - b.points || cols.indexOf(a.domain ?? "") - cols.indexOf(b.domain ?? ""),
    )

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
        <StageLayout rail={<Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} />}>
            <MainCard>
                <CardHeader left={<Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} onRoundClick={openRounds} />} />
                <div
                    className="grid min-h-0 flex-1 content-start justify-start gap-[0.9cqw]"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0, 10cqw))` }}
                >
                    {cells.map((q) => {
                        const where = boardMap.get(q._id) ?? "taken"
                        return (
                            <div
                                key={q._id}
                                title={where === "taken" ? "đã dùng" : where === "pending" ? "thí sinh đã chọn — chờ mở" : where === "open" ? "đang mở" : "còn trống"}
                                className={`flex aspect-[133/59] flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${where === "open"
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
                            </div>
                        )
                    })}
                </div>
            </MainCard>
            <Strip
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
            <Status error={flash} hint={boardHint} />
        </StageLayout>
    )
}
