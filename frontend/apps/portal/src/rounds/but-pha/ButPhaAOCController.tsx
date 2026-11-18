import { ConsoleStage, QuestionCard, QuestionChips, Rail, Timer } from "@/components/stage/deck"
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
    const { v, remaining, baseCards, flash, consoleButPha } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
    let pos: number | null = null
    if (openQ) pos = ctx.byId(openQ.questionId)?.position ?? 0
    let revealId: string | null = null
    if (consoleButPha?.opened === true) revealId = consoleButPha.questionId
    const clockStarted = consoleButPha?.clockStarted === true

    let startClock: (() => void) | undefined = undefined
    if (openQ) {
        if (!clockStarted) startClock = () => ctx.send({ kind: "but-pha.startClock" })
    }
    let revealAnswer: (() => void) | undefined = undefined
    if (revealId) {
        const answerId = revealId
        revealAnswer = () => ctx.send({ kind: "reveal.answer", questionId: answerId })
    }
    let timerRemaining: number | null = null
    if (openQ?.deadlineAt) timerRemaining = remaining

    return (
        <ConsoleStage
            rail={<Rail cards={baseCards} onSelect={ctx.toggleSelect} onScoreClick={ctx.openRegrade} />}
            actions={[
                {
                    label: COPY.startClock,
                    onClick: startClock,
                },
                ...verdictActions({
                    canVerdict: (ctx.target !== null || ctx.selectedIds.size > 0) && openQ !== null,
                    onVerdict: ctx.setVerdict,
                }),
                {
                    label: "Đáp án thí sinh",
                    onClick: revealAnswer,
                },
                backToLobbyAction(ctx.backToLobby),
            ]}
            flash={flash}
        >
            <QuestionCard
                round="Bứt phá"
                right={
                    <span className="flex items-center gap-[1.2cqw]">
                        <QuestionChips
                            chips={Array.from({ length: 4 }, (_, i) => ({
                                id: `chip-${i}`,
                                label: String(i + 1),
                                active: pos !== null && i === pos - 1,
                                clickable: openQ === null,
                            }))}
                            onSelect={() => ctx.pickQuestion()}
                        />
                        <Timer remaining={timerRemaining} />
                    </span>
                }
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
            />
        </ConsoleStage>
    )
}
