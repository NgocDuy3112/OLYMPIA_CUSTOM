import { ConsoleStage, QuestionFrame, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

import type { VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type VeDichChungCtx = ScreenCore & {
    remaining: number | null
    consoleVeDich: VeDichConsole | null
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    hetLuot: () => void
}

export function VeDichChungAOCController({ ctx }: { ctx: VeDichChungCtx }) {
    const { v, remaining, baseCards, consoleVeDich, flash, openRounds } = ctx
    const projection = v.projection

    const stripCells = (projection.board ?? []).filter((c) => c.where === "open" || c.where === "pending")
    const openNow = projection.open[0]
    const qid = openNow.questionId
    const revealed = consoleVeDich?.revealed ?? false
    const needsVerdict =
        consoleVeDich?.answererId ? ctx.verdictOf(qid, consoleVeDich.answererId) === null : true

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                {
                    label: "Tính giờ",
                    onClick: openNow && revealed
                        ? () => ctx.send({ kind: "ve-dich.startClock" })
                        : undefined,
                },
                ...verdictActions({ canVerdict: ctx.target !== null, onVerdict: ctx.setVerdict }),
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
            <QuestionFrame
                round="Về đích"
                mode="Lượt chung"
                onRoundClick={openRounds}
                mid={<VeDichStripCells cells={stripCells} phase2={false} />}
                right={<Timer remaining={openNow.deadlineAt ? remaining : null} />}
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
                onReveal={openNow && !revealed
                    ? () => ctx.send({ kind: "ve-dich.reveal" })
                    : undefined}
            />
        </ConsoleStage>
    )
}
