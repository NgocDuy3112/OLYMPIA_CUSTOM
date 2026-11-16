import { useState } from "react"
import { ConsoleStage, QuestionCard, Rail, Timer } from "@/components/stage/deck"
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
    const { v, questions, baseCards, consoleVeDich, flash } = ctx
    const projection = v.projection
    const phase2 = consoleVeDich?.phase === 2
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null

    const boardQs = questions.filter((q) => q.roundId === "ve-dich")
    const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
    const rows = boardRows(boardQs, (q) => q.points)

    const [chosen, setChosen] = useState<string[]>(
        () => (projection.board ?? []).filter((c) => c.where === "pending").map((c) => c.questionId),
    )
    const openCount = projection.open.length
    let need = Math.max(1, projection.table.length)
    if (phase2) need = NEED_PER_PHASE[2]
    const complete = chosen.length === need
    let picking = false
    if (openCount === 0) {
        picking = true
        if (phase2) {
            if (turnPlayer === null) picking = false
        }
    }

    const sendPicks = (ids: string[]) => {
        if (phase2) {
            if (!turnPlayer) return
            ctx.send({ kind: "ve-dich.pickBatch", playerId: turnPlayer, questionIds: ids })
            return
        }
        ctx.send({ kind: "ve-dich.pickRound", questionIds: ids })
    }

    const toggle = (id: string) => {
        if (!picking) return
        const staged = chosen.includes(id)
        if (!staged && chosen.length >= need) return
        let next = [...chosen, id]
        if (staged) next = chosen.filter((x) => x !== id)
        setChosen(next)
        sendPicks(next)
    }

    const pickedThisTurn = (consoleVeDich?.turnPicked ?? 0) === need
    let ready = complete
    if (phase2) {
        ready = false
        if (pickedThisTurn) {
            if (consoleVeDich?.pendingQuestionId != null) ready = true
        }
    }
    let openPicks: (() => void) | undefined = undefined
    if (ready) {
        if (phase2) {
            openPicks = () => ctx.send({ kind: "ve-dich.openQuestion", questionId: consoleVeDich?.pendingQuestionId ?? "" })
        } else {
            openPicks = () => ctx.send({ kind: "ve-dich.nextQuestion" })
        }
    }

    const staged = consoleVeDich?.stagedPower ?? null
    const usedThisTurn = consoleVeDich?.turnPowerUsed === true
    const canStage = phase2 && turnPlayer !== null && chosen.length > 0 && !usedThisTurn
    const [arming, setArming] = useState(false)
    const assignArmed = arming && canStage
    const stage = (power: "STAR" | "ASSIGN" | null, targetId?: string) => {
        if (!turnPlayer) return
        const action = {
            kind: "ve-dich.declarePower" as const,
            playerId: turnPlayer,
            power,
        }
        if (power === "ASSIGN") {
            if (targetId) {
                ctx.send({ ...action, targetId })
                return
            }
        }
        ctx.send(action)
    }

    const railSelect = (id: string) => {
        if (assignArmed) {
            setArming(false)
            stage("ASSIGN", id)
            return
        }
        if (phase2) {
            ctx.send({ kind: "ve-dich.setTurn", playerId: id })
            return
        }
        ctx.setSelectedPlayer(id)
    }

    let railVariant: "compact" | "answers" = "answers"
    if (phase2) railVariant = "compact"
    let powerText = "chưa chọn"
    if (usedThisTurn) powerText = "đã chốt lượt này"
    if (staged) {
        powerText = `Đã chọn: ${COPY.powerAssign}`
        if (staged.power === "STAR") powerText = `Đã chọn: ${COPY.powerStar}`
    }
    let stageStar: (() => void) | undefined = undefined
    if (canStage) stageStar = () => stage("STAR")
    let armAssign: (() => void) | undefined = undefined
    if (canStage) armAssign = () => setArming(true)
    let assignContent: string | undefined = undefined
    if (assignArmed) assignContent = "chọn thẻ để chỉ định"
    let stageNone: (() => void) | undefined = undefined
    if (canStage) stageNone = () => stage(null)
    let resetPicks: () => void = () => ctx.send({ kind: "ve-dich.clearPicks" })
    if (phase2) resetPicks = () => ctx.send({ kind: "ve-dich.advanceTurn" })
    let mode = "Lượt chung"
    if (phase2) mode = "Lượt cá nhân"

    return (
        <ConsoleStage
            rail={<Rail variant={railVariant} cards={baseCards} onSelect={railSelect} />}
            actions={[
                {
                    label: "Quyền năng",
                    content: powerText,
                    muted: true,
                    empty: !canStage && !usedThisTurn,
                },
                {
                    label: COPY.powerStar,
                    onClick: stageStar,
                    empty: !phase2,
                },
                {
                    label: COPY.powerAssign,
                    onClick: armAssign,
                    content: assignContent,
                    empty: !phase2,
                },
                {
                    label: COPY.powerNone,
                    onClick: stageNone,
                    empty: !phase2,
                },
                {
                    label: "Xác nhận",
                    onClick: openPicks,
                },
                {
                    label: "Chọn lại",
                    onClick: resetPicks,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode={mode}
                right={<Timer remaining={null} />}
            >
                <div className="flex min-h-0 flex-1 flex-col justify-start gap-[0.9cqw]">
                    {rows.map((row) => (
                        <div
                            key={row.value}
                            className="grid gap-[0.9cqw]"
                            style={{ gridTemplateColumns: `repeat(${VE_GRID_COLUMNS}, minmax(0, 1fr))` }}
                        >
                            {row.cells.map((q) => {
                                let where: CellWhere = "deferred"
                                if (phase2) where = "taken"
                                if (q.points <= 30) where = "taken"
                                const mapped = boardMap.get(q._id)
                                if (mapped !== undefined) where = mapped
                                const staged = chosen.includes(q._id)
                                const actionable = picking && (staged || (where === "free" && chosen.length < need))
                                let cellTitle = CELL_TITLE[where]
                                if (actionable) {
                                    cellTitle = "Chọn câu này"
                                    if (staged) cellTitle = "Nhấn để bỏ chọn"
                                }
                                return (
                                    <button
                                        key={q._id}
                                        type="button"
                                        disabled={!actionable}
                                        aria-pressed={staged}
                                        onClick={() => toggle(q._id)}
                                        title={cellTitle}
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
            </QuestionCard>
        </ConsoleStage>
    )
}
