import { ConsoleStage, QuestionFrame, Rail, Timer, VeDichStripCells } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

// Về đích — câu hỏi mở, phase 1 (S7): the shared round — the picked player
// types the answer, the console judges. Pure: everything comes from its ctx.
import type { VeDichConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

/** Về đích · phase 1 question: the typed answer + the judging strip. */
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
    const needsVerdict =
        consoleVeDich?.answererId ? ctx.verdictOf(qid, consoleVeDich.answererId) === null : true

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.setSelectedPlayer} />}
            actions={[
                ...verdictActions({ canVerdict: ctx.target !== null, onVerdict: ctx.setVerdict }),
                {
                    label: "Hiện đáp án",
                    // The open question's answer, on every screen — before Hết
                    // lượt closes it (the server hides the text at that point).
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
                right={<Timer remaining={remaining} />}
                question={openNow.question?.questionText ?? ""}
                media={openNow.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
