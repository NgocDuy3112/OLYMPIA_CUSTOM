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
    /** answers of the open question — everyone in phase 1 answers it */
    rows: QuestionAnswerRow[]
}

export function VeDichChungAOCController({ ctx }: { ctx: VeDichChungCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash, openRounds, rows } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where === "open" || c.where === "pending")
    const openNow = projection.open[0]
    const revealed = consoleVeDich?.revealed ?? false
    // phase 1: every seated player answers, so the set moves on once every
    // submitted answer carries a verdict — nobody answered means nothing to grade
    const needsVerdict = rows.some((r) => r.verdict === null)
    // JudgeFact needs a real answer row, so only players who actually answered
    // are gradeable — a ticked card without an answer would score for nothing
    const gradeableIds = () => {
        const answered = (id: string) => rows.some((r) => r.userId === id)
        if (ctx.selectedIds.size > 0) return [...ctx.selectedIds].filter(answered)
        return ctx.target !== null && answered(ctx.target) ? [ctx.target] : []
    }
    const canMark = gradeableIds().length > 0

    const mark = (correct: boolean) => {
        const ids = gradeableIds()
        if (ids.length === 0) return
        ctx.sendChain(ids.map((playerId) => ({ kind: "ve-dich.judge" as const, playerId, correct })))
    }

    // the question card is the reveal control — clicking it shows the question
    // to every player
    const reveal = openNow && !revealed
        ? () => ctx.send({ kind: "ve-dich.reveal" })
        : undefined

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                {
                    label: "Tính giờ",
                    onClick: openNow && revealed
                        ? () => ctx.send({ kind: "ve-dich.startClock" })
                        : undefined,
                },
                ...verdictActions({ canVerdict: canMark, onVerdict: mark }),
                {
                    label: "Hiện đáp án",
                    onClick: openNow
                        ? () => ctx.send({ kind: "reveal.answer", questionId: openNow.questionId })
                        : undefined,
                },
                { label: COPY.endTurn, onClick: needsVerdict ? undefined : () => ctx.hetLuot() },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Về đích"
                mode="Lượt chung"
                onRoundClick={openRounds}
                mid={<VeDichStripCells cells={stripCells} phase2={false} />}
                right={<Timer remaining={openNow.deadlineAt ? remaining : null} />}
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
                onReveal={reveal}
            />
        </ConsoleStage>
    )
}
