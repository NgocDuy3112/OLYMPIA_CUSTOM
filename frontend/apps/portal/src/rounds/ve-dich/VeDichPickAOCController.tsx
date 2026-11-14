import { useState } from "react"
import { ConsoleStage, QuestionCard, Rail } from "@/components/stage/deck"
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
    const { v, questions, baseCards, consoleVeDich, flash, openRounds } = ctx
    const projection = v.projection
    const phase2 = consoleVeDich?.phase === 2
    const turnPlayer = consoleVeDich?.turnPlayerId ?? null

    const boardQs = questions.filter((q) => q.roundId === "ve-dich")
    const boardMap = new Map((projection.board ?? []).map((c) => [c.questionId, c.where]))
    const rows = boardRows(boardQs, (q) => q.points)

    // the board's remount key carries pendingCount, so this draft re-seeds from
    // the projection the moment the engine's set catches up (or is cleared)
    const [chosen, setChosen] = useState<string[]>(
        () => (projection.board ?? []).filter((c) => c.where === "pending").map((c) => c.questionId),
    )
    const openCount = projection.open.length
    // phase 1: one question per player — the controller picks for the table, no
    // turn involved; phase 2 keeps its per-turn batch of three
    const need = phase2 ? NEED_PER_PHASE[2] : Math.max(1, projection.table.length)
    const complete = chosen.length === need
    // a question already picked stays clickable — it takes itself back
    const picking = openCount === 0 && (phase2 ? turnPlayer !== null : true)

    const sendPicks = (ids: string[]) => {
        if (phase2) {
            if (!turnPlayer) return
            ctx.send({ kind: "ve-dich.pickBatch", playerId: turnPlayer, questionIds: ids })
            return
        }
        ctx.send({ kind: "ve-dich.pickRound", questionIds: ids })
    }

    // every click writes the whole set — there is no confirm button left to press
    const toggle = (id: string) => {
        if (!picking) return
        const staged = chosen.includes(id)
        if (!staged && chosen.length >= need) return
        const next = staged ? chosen.filter((x) => x !== id) : [...chosen, id]
        setChosen(next)
        sendPicks(next)
    }

    // Xác nhận needs a whole turn: three questions in phase 2, one per seat in
    // phase 1. Hết lượt returns to this board with two questions left, then one —
    // turnPicked is what says those three were picked together, so a shrinking
    // set still opens the next one while a batch being assembled does not.
    const pickedThisTurn = (consoleVeDich?.turnPicked ?? 0) === need
    const ready = phase2
        ? pickedThisTurn && consoleVeDich?.pendingQuestionId != null
        : complete
    const openPicks = ready
        ? phase2
            ? () => ctx.send({ kind: "ve-dich.openQuestion", questionId: consoleVeDich?.pendingQuestionId ?? "" })
            : () => ctx.send({ kind: "ve-dich.nextQuestion" })
        : undefined

    const staged = consoleVeDich?.stagedPower ?? null
    const usedThisTurn = consoleVeDich?.turnPowerUsed === true
    const canStage = phase2 && turnPlayer !== null && chosen.length > 0 && !usedThisTurn
    const [arming, setArming] = useState(false)
    // the arm only lasts while staging is still possible — the power landing
    // (or the picks running out) closes it without a second click
    const assignArmed = arming && canStage
    const stage = (power: "STAR" | "ASSIGN" | null, targetId?: string) => {
        if (!turnPlayer) return
        ctx.send({
            kind: "ve-dich.declarePower",
            playerId: turnPlayer,
            power,
            ...(power === "ASSIGN" && targetId ? { targetId } : {})
        })
    }

    // phase 2 rail: the card names who plays next — unless ASSIGN is armed,
    // where the second click names the player the question is handed to
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

    return (
        <ConsoleStage
            rail={<Rail variant={phase2 ? "compact" : "answers"} cards={baseCards} onSelect={railSelect} />}
            actions={[
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
                    onClick: canStage ? () => setArming(true) : undefined,
                    content: assignArmed ? "chọn thẻ để chỉ định" : undefined,
                    empty: !phase2,
                },
                {
                    label: COPY.powerNone,
                    onClick: canStage ? () => stage(null) : undefined,
                    empty: !phase2,
                },
                {
                    label: "Xác nhận",
                    onClick: openPicks,
                },
                {
                    label: "Chọn lại",
                    onClick: phase2
                        ? () => ctx.send({ kind: "ve-dich.advanceTurn" })
                        : () => ctx.send({ kind: "ve-dich.clearPicks" }),
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode={phase2 ? "Lượt cá nhân" : "Lượt chung"}
                onRoundClick={openRounds}
            >
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
                                const actionable = picking && (staged || (where === "free" && chosen.length < need))
                                return (
                                    <button
                                        key={q._id}
                                        type="button"
                                        disabled={!actionable}
                                        aria-pressed={staged}
                                        onClick={() => toggle(q._id)}
                                        title={actionable
                                            ? staged ? "Nhấn để bỏ chọn" : "Chọn câu này"
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
            </QuestionCard>
        </ConsoleStage>
    )
}
