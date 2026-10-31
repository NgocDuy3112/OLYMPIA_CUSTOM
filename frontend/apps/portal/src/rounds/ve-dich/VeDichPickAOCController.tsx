import { Badges, CardHeader, MainCard, Rail, StageLayout, Status, Strip } from "@/components/stage/deck"
import { pt, DECK_PAD } from "@shared/deck/geometry"
import { sortVeCells } from "@shared/deck/ve-dich-board"

// Về đích — bảng chọn câu (S5 = phase 2 bốc 3 câu · S6 = phase 1 chọn 1 câu).
// No question is open; the grid is a CSS grid driven by the frozen set —
// columns = domains, rows follow from the count; any size fits, none clipped.
import type { ConsoleQuestion, VeDichMc } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Về đích · board: the picker grid while nothing is open. */
export type VeDichPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    mcVeDich: VeDichMc | null
}

export function VeDichPickAOCController({ ctx }: { ctx: VeDichPickCtx }) {
    const { v, questions, baseCards, mcVeDich, flash, openRounds } = ctx
    const projection = v.projection
    const phase2 = mcVeDich?.phase === 2

    const boardQs = questions.filter((q) => q.roundId === "ve-dich")
    const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
    // The fixed matrix: canonical domains × score bands (20 → 50, as drawn).
    const cells = sortVeCells(boardQs, (q) => q.domain ?? "", (q) => q.points)
    const cols = [...new Set(cells.map((q) => q.domain ?? ""))]
    // Chung: only the TOP free band is pickable this turn — everything lower fades.
    const maxFree = Math.max(-1, ...cells.filter((q) => boardMap.get(q._id) === "free").map((q) => q.points))

    return (
        <StageLayout rail={<Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} />}>
            <MainCard>
                <CardHeader left={<Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} onRoundClick={openRounds} />} />
                <div
                    className="grid min-h-0 flex-1 content-start justify-start gap-[0.9cqw]"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0, 10cqw))` }}
                >
                    {cells.map((q) => {
                        const where = boardMap.get(q._id) ?? (phase2 || q.points <= 30 ? "taken" : "deferred")
                        const faded = where === "deferred"
                            || (!phase2 && where === "free" && q.points < maxFree)
                        return (
                            <div
                                key={q._id}
                                title={
                                    where === "taken" ? "đã dùng"
                                    : where === "pending" ? "thí sinh đã chọn — chờ mở"
                                    : where === "open" ? "đang mở"
                                    : where === "deferred" ? "dành cho Lượt cá nhân"
                                    : faded ? "lượt này không chọn được"
                                    : "còn trống"
                                }
                                className={`flex aspect-[133/59] flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${where === "open"
                                        ? "bg-primary text-primary-foreground ring-primary"
                                        : where === "pending"
                                            ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
                                        : where === "taken"
                                            ? "bg-black text-white ring-black"
                                        : faded
                                            ? "bg-card text-muted-foreground/40 ring-border opacity-50"
                                            : "bg-card ring-border"
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
                        onClick: phase2
                            ? () => ctx.send({ kind: "ve-dich.openQuestion", questionId: mcVeDich?.pendingQuestionId ?? "" })
                            : () => ctx.send({ kind: "ve-dich.beginPhase2" }),
                    },
                    {
                        label: "Chọn lại",
                        onClick: () =>
                            mcVeDich && mcVeDich.turnPlayerId === null && mcVeDich.phase === 1
                                ? ctx.send({ kind: "ve-dich.beginPhase2" })
                                : ctx.send({ kind: "ve-dich.advanceTurn" }),
                    },
                    { label: "Về sảnh", onClick: ctx.ketThuc },
                ]}
            />
            <Status error={flash} />
        </StageLayout>
    )
}
