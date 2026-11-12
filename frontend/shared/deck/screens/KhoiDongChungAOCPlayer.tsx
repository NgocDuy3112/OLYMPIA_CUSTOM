import { AnswerBand, PlayerStage, Progress, QuestionFrame, Rail, Timer, type PlayerCore } from "../player-deck"
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
            band={
                !openQ ? (
                    <span
                        className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border"
                        style={{ fontSize: 12, borderRadius: 6 }}
                    >
                        Chờ điều hành mở câu tiếp theo…
                    </span>
                ) : !windowOpen ? (
                    <span
                        className="flex h-[3.3cqw] items-center rounded-lg bg-muted px-[1.2cqw] font-sans font-semibold text-foreground ring-1 ring-border"
                        style={{ fontSize: 12, borderRadius: 6 }}
                    >
                        Chờ điều hành bấm giờ…
                    </span>
                ) : (
                    <AnswerBand
                        question={openQ.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[openQ.questionId]}
                        disabled={locked}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                    />
                )
            }
        >
            <QuestionFrame
                round="Khởi động"
                mode="Lượt chung"
                right={
                    <>
                        <Progress
                            total={v.me.questionCount ?? 6}
                            done={v.me.questionIndex ?? 0}
                            active={v.me.questionIndex ?? 0}
                        />
                        <Timer remaining={windowOpen ? remaining : null} fallback="10s" />
                    </>
                }
                question={openQ?.question?.questionText ?? "Chờ mở câu tiếp theo…"}
                media={openQ?.question?.media ?? null}
                answer={v.revealed?.answer}
            />
        </PlayerStage>
    )
}
