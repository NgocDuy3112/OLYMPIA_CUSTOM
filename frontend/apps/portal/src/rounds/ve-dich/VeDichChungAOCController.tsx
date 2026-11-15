import { ConsoleStage, QuestionCard, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

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

    const stripCells = (projection.board ?? []).filter((c) => c.where === "open" || c.where === "pending")
    const openNow = projection.open[0]
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

    const mark = (correct: boolean) => {
        const ids = gradeableIds()
        if (ids.length === 0) return
        ctx.sendChain(ids.map((playerId) => ({ kind: "ve-dich.judge" as const, playerId, correct })))
    }

    let reveal: (() => void) | undefined = undefined
    if (openNow) {
        if (!revealed) reveal = () => ctx.send({ kind: "ve-dich.reveal" })
    }
    let startClock: (() => void) | undefined = undefined
    if (openNow) {
        if (revealed) startClock = () => ctx.send({ kind: "ve-dich.startClock" })
    }
    let revealAnswer: (() => void) | undefined = undefined
    if (openNow) {
        revealAnswer = () => ctx.send({ kind: "reveal.answer", questionId: openNow.questionId })
    }
    let endTurn: (() => void) | undefined = () => ctx.hetLuot()
    if (needsVerdict) endTurn = undefined
    let timerRemaining: number | null = null
    if (openNow.deadlineAt) timerRemaining = remaining

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                {
                    label: "Tính giờ",
                    onClick: startClock,
                },
                ...verdictActions({ canVerdict: canMark, onVerdict: mark }),
                {
                    label: "Hiện đáp án",
                    onClick: revealAnswer,
                },
                { label: COPY.endTurn, onClick: endTurn },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                mid={<VeDichStripCells cells={stripCells} phase2={false} />}
                right={<Timer remaining={timerRemaining} />}
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
                onReveal={reveal}
            />
        </ConsoleStage>
    )
}
