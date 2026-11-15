import { AnswerBand, PlayerStage, Progress, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"
import type { AnswerValue } from "../types"

type ButPhaPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

export function ButPhaAOCPlayer({ ctx }: { ctx: ButPhaPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const openQ = ctx.open[0] ?? null
    const pos = openQ?.question?.position ?? null
    let done = 0
    if (pos !== null) done = pos
    if (ctx.stage === "ended") done = 4
    let timerRemaining: number | null = null
    if (openQ) {
        if (openQ.deadlineAt) timerRemaining = remaining
    }
    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={openQ?.questionId ?? null} />}
        >
            <QuestionCard
                round="Bứt phá"
                right={
                    <>
                        <Progress total={4} done={done} active={pos ?? done} />
                        <Timer remaining={timerRemaining} />
                    </>
                }
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
                answer={v.revealed?.answer}
            />
            {openQ && (
                <AnswerBand
                    question={openQ.question}
                    answerState={v.me.answerState}
                    disabled={remaining <= 0}
                    busy={answerBusy}
                    error={flash}
                    onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                />
            )}
        </PlayerStage>
    )
}
