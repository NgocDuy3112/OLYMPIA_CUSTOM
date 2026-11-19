import { AnswerBand, PlayerStage, QuestionCard, QuestionStepper, Rail, Timer, type PlayerCore } from "../player-deck"
import type { AnswerValue } from "../types"

type ButPhaPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

const TOTAL_QUESTIONS = 4

export function ButPhaAOCPlayer({ ctx }: { ctx: ButPhaPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const openQ = ctx.open[0] ?? null
    let active: number | null = null
    let done = 0
    if (openQ) {
        if (openQ.question) {
            active = openQ.question.position
            done = active
        }
    }
    if (ctx.stage === "ended") {
        done = TOTAL_QUESTIONS
        active = null
    }
    let timerRemaining: number | null = null
    if (openQ) {
        if (openQ.deadlineAt) timerRemaining = remaining
    }
    return (
        <PlayerStage
            rail={<Rail view={v} myId={myId} currentQid={openQ?.questionId ?? null} />}
        >
            <QuestionCard
                round="Bứt phá"
                right={
                    <>
                        <QuestionStepper total={TOTAL_QUESTIONS} done={done} active={active} next={null} />
                        <Timer remaining={timerRemaining} />
                    </>
                }
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
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
