import { useState } from "react"
import { Badges, CardHeader, ConsoleStage, MainCard, Rail } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { pt, DECK_PAD } from "@shared/deck/geometry"
import { playerCellClass, type CellWhere } from "@shared/deck/cells"
import { COPY } from "@shared/deck/copy"
import { VE_GRID_COLUMNS, boardRows } from "@shared/deck/ve-dich-board"

import type { ConsoleQuestion, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type VeDichPickCtx = ScreenCore & {
    questions: ConsoleQuestion[]
    consoleVeDich: VeDichConsole | null
    target: string | null
    setSelectedPlayer: (userId: string) => void
}

const CELL_TITLE: Record<CellWhere, string> = {
    taken: "đã dùng",
    pending: "thí sinh đã chọn — chờ mở",
    open: "đang mở",
    deferred: "dành cho Lượt cá nhân",
    free: "còn trống",
}

const NEED_PER_PHASE = { 1: 1, 2: 3 } as const

export function VeDichPickAOCController({ ctx }: { ctx: VeDichPickCtx }) {
    const projection = ctx.v.projection
    const turnPlayer = ctx.consoleVeDich?.turnPlayerId ?? null
    const pendingCount = (projection.board ?? []).filter((c) => c.where === "pending").length
    const stagingKey = `${turnPlayer ?? "-"}:${pendingCount}:${projection.open.length}`
    return <VeDichPickBoard key={stagingKey} ctx={ctx} />
}

function VeDichPickBoard({ ctx }: { ctx: VeDichPickCtx }) {
    const { v, questions, baseCards, consoleVeDich, flash, openRounds } = ctx
    const projection = v.projection
    const phase2 = consoleVeDich?.phase === 2
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null

    const boardQs = questions.filter((q) => q.roundId === "ve-dich")
    const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
    const rows = boardRows(boardQs, (q) => q.points)

    const [chosen, setChosen] = useState<string[]>([])
    const pendingCount = (projection.board ?? []).filter((c) => c.where === "pending").length
    const openCount = projection.open.length
    const need = phase2 ? NEED_PER_PHASE[2] : NEED_PER_PHASE[1]
    const picking = turnPlayer !== null && openCount === 0 && (phase2 ? pendingCount === 0 : true)

    const toggle = (id: string) => {
        if (!picking) return
        setChosen((current) => {
            if (current.includes(id)) return current.filter((x) => x !== id)
            if (!phase2) return [id]
            return current.length >= need ? current : [...current, id]
        })
    }
    const confirm = () => {
        if (!turnPlayer || chosen.length !== need) return
        if (phase2) ctx.send({ kind: "ve-dich.pickBatch", playerId: turnPlayer, questionIds: chosen })
        else ctx.send({ kind: "ve-dich.pick", playerId: turnPlayer, questionId: chosen[0] })
    }

    const staged = consoleVeDich?.stagedPower ?? null
    const usedThisTurn = consoleVeDich?.turnPowerUsed === true
    const canStage = phase2 && turnPlayer !== null && pendingCount > 0 && !usedThisTurn
    const stage = (power: "STAR" | "ASSIGN" | null) => {
        if (!turnPlayer) return
        ctx.send({
            kind: "ve-dich.declarePower",
            playerId: turnPlayer,
            power,
            ...(power === "ASSIGN" && ctx.target ? { targetId: ctx.target } : {})
        })
    }

    return (
        <ConsoleStage
            rail={<Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                {
                    label: phase2 ? `Chốt ${need} câu` : "Chọn câu này",
                    onClick: picking && chosen.length === need ? confirm : undefined,
                },
                {
                    label: "Quyền năng",
                    content: staged
                        ? `Đã chọn: ${staged.power === "STAR" ? COPY.powerStar : COPY.powerAssign}`
                        : usedThisTurn
                            ? "đã chốt lượt này"
                            : "chưa chọn",
                    muted: true,
                    empty: !canStage && !usedThisTurn,
                },
                {
                    label: COPY.powerStar,
                    onClick: canStage ? () => stage("STAR") : undefined,
                    empty: !phase2,
                },
                {
                    label: COPY.powerAssign,
                    onClick: canStage && ctx.target ? () => stage("ASSIGN") : undefined,
                    empty: !phase2,
                },
                {
                    label: COPY.powerNone,
                    onClick: canStage ? () => stage(null) : undefined,
                    empty: !phase2,
                },
                {
                    label: "Bắt đầu",
                    onClick: phase2
                        ? () => ctx.send({ kind: "ve-dich.openQuestion", questionId: consoleVeDich?.pendingQuestionId ?? "" })
                        : () => ctx.send({ kind: "ve-dich.beginPhase2" }),
                },
                {
                    label: "Chọn lại",
                    onClick: () =>
                        consoleVeDich && consoleVeDich.turnPlayerId === null && consoleVeDich.phase === 1
                            ? ctx.send({ kind: "ve-dich.beginPhase2" })
                            : ctx.send({ kind: "ve-dich.advanceTurn" }),
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <MainCard>
                <CardHeader left={<Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} onRoundClick={openRounds} />} />
                <div className="flex min-h-0 flex-1 flex-col justify-start gap-[0.9cqw]">
                    {rows.map((row) => (
                        <div
                            key={row.value}
                            className="grid gap-[0.9cqw]"
                            style={{ gridTemplateColumns: `repeat(${VE_GRID_COLUMNS}, minmax(0, 1fr))` }}
                        >
                            {row.cells.map((q) => {
                                const where: CellWhere = boardMap.get(q._id) ?? (phase2 || q.points <= 30 ? "taken" : "deferred")
                                const staged = chosen.includes(q._id)
                                const actionable = picking && where === "free"
                                    && (staged || chosen.length < need)
                                return (
                                    <button
                                        key={q._id}
                                        type="button"
                                        disabled={!actionable}
                                        aria-pressed={staged}
                                        onClick={() => toggle(q._id)}
                                        title={where === "free"
                                            ? actionable ? "Chọn câu này" : CELL_TITLE.free
                                            : CELL_TITLE[where]}
                                        className={playerCellClass({ where, chosen: staged, actionable })}
                                        style={{ ...DECK_PAD, gridColumn: `span ${row.span}` }}
                                    >
                                        <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{q.points}</b>
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>
            </MainCard>
        </ConsoleStage>
    )
}
