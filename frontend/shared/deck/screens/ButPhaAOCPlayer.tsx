import { AnswerBand, PlayerStage, Progress, QuestionFrame, Rail, Timer, type PlayerCore } from "../player-deck"
import { pt } from "../geometry"
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
    const done = ctx.stage === "ended" ? 4 : pos !== null ? pos : 0
    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={openQ?.questionId ?? null} />}
            band={
                openQ ? (
                    <AnswerBand
                        question={openQ.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[openQ.questionId]}
                        disabled={remaining <= 0}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                    />
                ) : (
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ điều hành mở câu tiếp theo…</span>
                )
            }
        >
            <QuestionFrame
                round="Bứt phá"
                right={
                    <>
                        <Progress total={4} done={done} active={pos ?? done} />
                        <Timer remaining={openQ?.deadlineAt ? remaining : null} />
                    </>
                }
                question={openQ?.question?.questionText ?? null}
                media={openQ?.question?.media ?? null}
                answer={v.revealed?.answer}
            />
        </PlayerStage>
    )
}
