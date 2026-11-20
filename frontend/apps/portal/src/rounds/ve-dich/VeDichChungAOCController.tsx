import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"
import { stripCellsOf } from "@shared/deck/ve-dich-board"
import type { LiveAction } from "@/lib/live-actions"

import type { QuestionAnswerRow, VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type VeDichChungCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
    rows: QuestionAnswerRow[]
}

export function VeDichChungAOCController({ ctx }: { ctx: VeDichChungCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash, rows } = ctx
    const projection = v.projection

    const openNow = projection.open[0] ?? null
    const boardCells = projection.board ?? []
    const stripCells = stripCellsOf(boardCells)
    const revealed = consoleVeDich?.revealed ?? false
    const needsVerdict = rows.some((r) => r.verdict === null)
    const gradeableIds = () => {
        const answered = (id: string) => rows.some((r) => r.userId === id)
        if (ctx.selectedIds.size > 0) return [...ctx.selectedIds].filter(answered)
        if (ctx.target !== null) {
            if (answered(ctx.target)) return [ctx.target]
        }
        return []
    }
    const canMark = gradeableIds().length > 0

    const grade = () => {
        const ids = gradeableIds()
        if (ids.length === 0) return
        const actions = rows.map((row) => {
            let correct = false
            if (ids.includes(row.userId)) correct = true
            return { kind: "ve-dich.judge" as const, playerId: row.userId, correct }
        })
        ctx.sendChain(actions)
    }
    let gradeClick: (() => void) | undefined
    if (canMark) gradeClick = grade

    let counting = false
    if (openNow?.deadlineAt && (remaining ?? 0) > 0) counting = true
    let startClock: (() => void) | undefined = undefined
    if (openNow) {
        if (revealed) {
            if (!counting) startClock = () => ctx.send({ kind: "ve-dich.startClock" })
        }
    }
    let revealAnswer: (() => void) | undefined = undefined
    if (openNow) {
        let clockDone = false
        if (consoleVeDich?.clockStarted) {
            if (!counting) clockDone = true
        }
        if (clockDone) revealAnswer = () => ctx.send({ kind: "reveal.answer", questionId: openNow.questionId })
    }
    let endTurn: (() => void) | undefined = () => ctx.hetLuot()
    if (needsVerdict) endTurn = undefined
    if (openNow === null) endTurn = undefined
    let timerRemaining: number | null = null
    if (openNow?.deadlineAt) timerRemaining = remaining

    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={ctx.toggleSelect} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: "Đếm giờ",
                    onClick: startClock,
                },
                {
                    label: "Hiện trả lời",
                    onClick: revealAnswer,
                },
                {
                    label: "Chấm điểm",
                    onClick: gradeClick,
                },
                { label: COPY.endTurn, onClick: endTurn },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={stripCells.map((cell) => ({
                                id: cell.questionId,
                                label: String(cell.value),
                                active: cell.where === "open",
                                clickable: !revealed,
                            }))}
                            onSelect={(id: string) => {
                                const actions: LiveAction[] = []
                                if (openNow === null || id !== openNow.questionId) {
                                    actions.push({ kind: "ve-dich.openPending", questionId: id })
                                }
                                if (!revealed) actions.push({ kind: "ve-dich.reveal" })
                                if (actions.length > 0) void ctx.sendChain(actions)
                            }}
                        />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openNow !== null && revealed ? openNow.question?.questionText ?? "" : ""}
                media={openNow !== null && revealed ? openNow.question?.media ?? null : null}
            />
        </ConsoleStage>
    )
}
