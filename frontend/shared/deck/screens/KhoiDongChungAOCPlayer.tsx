import { AnswerBand, PlayerStage, Progress, QuestionCard, Rail, Timer, type PlayerCore } from "../player-deck"
import type { AnswerValue } from "../types"

type KhoiDongChungPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

export function KhoiDongChungAOCPlayer({ ctx }: { ctx: KhoiDongChungPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const openQ = ctx.open[0]
    const windowOpen = v.me.windowOpen === true
    const locked = !windowOpen || remaining <= 0

    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={openQ?.questionId ?? null} />}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt chung"
                right={
                    <>
                        <Progress
                            total={v.me.questionCount ?? 6}
                            done={v.me.questionIndex ?? 0}
                            active={v.me.questionIndex ?? 0}
                        />
                        <Timer remaining={windowOpen ? remaining : null} fallback="10" />
                    </>
                }
                question={openQ?.question?.questionText ?? ""}
                media={openQ?.question?.media ?? null}
                answer={v.revealed?.answer}
            />
            {!openQ ? null : (
                <AnswerBand
                    question={openQ.question}
                    answerState={v.me.answerState}
                    disabled={locked}
                    busy={answerBusy}
                    error={flash}
                    onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                />
            )}
        </PlayerStage>
    )
}
