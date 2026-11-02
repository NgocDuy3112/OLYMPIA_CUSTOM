import { Badges, CardHeader, ConsoleStage, MainCard, Rail } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { pt, DECK_PAD } from "@shared/deck/geometry"
import { mcCellClass, type CellWhere } from "@shared/deck/cells"
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

/** What each cell's title says — the state in the MC's words. */
const CELL_TITLE: Record<CellWhere, string> = {
    taken: "đã dùng",
    pending: "thí sinh đã chọn — chờ mở",
    open: "đang mở",
    deferred: "dành cho Lượt cá nhân",
    free: "còn trống",
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
        <ConsoleStage
            rail={<Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} />}
            actions={[
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
                backToLobbyAction(ctx.ketThuc),
            ]}
            flash={flash}
        >
            <MainCard>
                <CardHeader left={<Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} onRoundClick={openRounds} />} />
                <div
                    className="grid min-h-0 flex-1 content-start justify-start gap-[0.9cqw]"
                    style={{ gridTemplateColumns: `repeat(${Math.max(1, cols.length)}, minmax(0, 10cqw))` }}
                >
                    {cells.map((q) => {
                        const where: CellWhere = boardMap.get(q._id) ?? (phase2 || q.points <= 30 ? "taken" : "deferred")
                        const faded = where === "deferred"
                            || (!phase2 && where === "free" && q.points < maxFree)
                        return (
                            <div
                                key={q._id}
                                title={where === "free" && faded ? "lượt này không chọn được" : CELL_TITLE[where]}
                                className={mcCellClass(where, faded)}
                                style={DECK_PAD}
                            >
                                <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{q.domain}</span>
                                <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{q.points}</b>
                            </div>
                        )
                    })}
                </div>
            </MainCard>
        </ConsoleStage>
    )
}
