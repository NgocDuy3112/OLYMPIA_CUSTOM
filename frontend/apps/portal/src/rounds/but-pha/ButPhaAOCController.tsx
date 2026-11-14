import { ConsoleStage, Progress, QuestionCard, Rail, Timer } from "@/components/stage/deck"
import { backToLobbyAction, verdictActions } from "@/components/stage/actions"
import { COPY } from "@shared/deck/copy"

import type { ConsoleQuestion, ButPhaConsole } from "@/lib/live"
import type { ScreenCore } from "../types"

export type ButPhaCtx = ScreenCore & {
    remaining: number | null
    pickQuestion: () => void
    target: string | null
    setVerdict: (correct: boolean) => void
    setSelectedPlayer: (userId: string) => void
    byId: (id: string) => ConsoleQuestion | null
    consoleButPha: ButPhaConsole | null
}

export function ButPhaAOCController({ ctx }: { ctx: ButPhaCtx }) {
    const { v, remaining, baseCards, flash, openRounds, consoleButPha } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    const pos = openQ ? (ctx.byId(openQ.questionId)?.position ?? 0) : null
    const done = pos ?? 0
    const revealId = consoleButPha?.opened === true ? consoleButPha.questionId : null
    const clockStarted = consoleButPha?.clockStarted === true

    return (
        <ConsoleStage
            rail={<Rail variant="answers" cards={baseCards} onSelect={ctx.toggleSelect} />}
            actions={[
                {
                    label: COPY.startClock,
                    onClick: openQ && !clockStarted
                        ? () => ctx.send({ kind: "but-pha.startClock" })
                        : undefined,
                },
                ...verdictActions({
                    canVerdict: (ctx.target !== null || ctx.selectedIds.size > 0) && openQ !== null,
                    onVerdict: ctx.setVerdict,
                }),
                {
                    label: "Hiện đáp án",
                    onClick: revealId
                        ? () => ctx.send({ kind: "reveal.answer", questionId: revealId })
                        : undefined,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Bứt phá"
                onRoundClick={openRounds}
                right={
                    <>
                        <Progress total={4} done={done} active={pos ?? done} />
                        <Timer remaining={openQ?.deadlineAt ? remaining : null} />
                    </>
                }
                question={openQ?.question?.questionText ?? "Nhấn vào thẻ để mở câu tiếp theo"}
                media={openQ?.question?.media ?? null}
                onReveal={() => ctx.pickQuestion()}
            />
        </ConsoleStage>
    )
}
