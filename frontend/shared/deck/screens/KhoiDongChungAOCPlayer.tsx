import { AnswerBand, PlayerStage, QuestionCard, QuestionStepper, Rail, Timer, type PlayerCore , SubmissionLog, type SubmissionEntry } from "../player-deck"
import type { AnswerValue } from "../types"

type KhoiDongChungPlayerCtx = PlayerCore & {
    remaining: number
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

export function KhoiDongChungAOCPlayer({ ctx }: { ctx: KhoiDongChungPlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const submissions: SubmissionEntry[] = []
    if (v.me.mySubmission) {
        submissions.push({ kind: "answer", answer: v.me.mySubmission.answer, elapsedS: v.me.mySubmission.elapsedS })
    }
    const openQ = ctx.open[0]
    const windowOpen = v.me.windowOpen === true
    const locked = !windowOpen || remaining <= 0
    let timerRemaining: number | null = null
    if (windowOpen) timerRemaining = remaining

    return (
        <PlayerStage
            rail={<Rail view={v} myId={myId} currentQid={openQ?.questionId ?? null} />}
        >
            <QuestionCard
                round="Khởi động"
                mode="Lượt chung"
                right={
                    <>
                        <QuestionStepper
                            total={v.me.questionCount ?? 6}
                            done={v.me.questionIndex ?? 0}
                            active={v.me.questionIndex ?? 0}
                            next={null}
                        />
                        <Timer remaining={timerRemaining} />
                    </>
                }
                question={openQ?.question?.questionText ?? ""}
                media={openQ?.question?.media ?? null}
            />
            {openQ && (
                <AnswerBand
                    question={openQ.question}
                    answered={v.me.answerState === "answered"}
                    disabled={locked}
                    busy={answerBusy}
                    error={flash}
                    onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                />
            )}
            <SubmissionLog entries={submissions} />
        </PlayerStage>
    )
}
