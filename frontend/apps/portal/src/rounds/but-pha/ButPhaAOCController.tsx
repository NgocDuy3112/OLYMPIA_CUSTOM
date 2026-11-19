import { ConsoleStage, QuestionCard, QuestionStepper, Rail, Timer } from "@/components/stage/deck"
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

const TOTAL_QUESTIONS = 4

export function ButPhaAOCController({ ctx }: { ctx: ButPhaCtx }) {
    const { v, remaining, baseCards, flash, consoleButPha } = ctx
    const open = v.projection.open
    const openQ = open[0] ?? null
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

    let ended = v.roundEnded
    if (v.projection.stage === "ended") ended = true

    let done: number
    let active: number | null = null
    let next: number | null = null
    if (ended) {
        done = TOTAL_QUESTIONS
    } else if (openQ) {
        let pos = 0
        const opened = ctx.byId(openQ.questionId)
        if (opened) pos = opened.position
        done = pos
        active = pos
        next = pos + 1
        if (next >= TOTAL_QUESTIONS) next = pos
    } else {
        let cursor = 0
        if (consoleButPha) {
            if (consoleButPha.questionId) {
                const cursorQuestion = ctx.byId(consoleButPha.questionId)
                if (cursorQuestion) cursor = cursorQuestion.position
            }
        }
        done = cursor
        next = cursor
    }

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
                        <QuestionStepper
                            total={TOTAL_QUESTIONS}
                            done={done}
                            active={active}
                            next={next}
                            onAdvance={ctx.pickQuestion}
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
