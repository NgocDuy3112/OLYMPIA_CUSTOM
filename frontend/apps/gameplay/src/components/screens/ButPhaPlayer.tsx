import { formatRemaining } from "@shared/lib/clock"
import { Band, Badges, MainCard, Progress, QuestionBlock, Rail, Status, Timer, AnswerBand, type PlayerCtx } from "@shared/deck/player-deck"
import { pt } from "@shared/deck/geometry"

// Bứt phá (S4): sequential typed questions, one open at a time. Pure: every
// value comes from the orchestrator's PlayerCtx.
export function ButPhaPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, answerBusy, submitAnswer } = ctx
    const openQ = ctx.open[0] ?? null
    const pos = openQ?.question?.position ?? null
    const done = ctx.stage === "ended" ? 4 : pos !== null ? pos : 0
    return (
        <>
            <MainCard>
                <Badges round="Bứt phá" />
                <Progress total={4} done={done} active={pos ?? done} />
                <Timer remaining={openQ ? remaining : null} fallback="30s" />
                <QuestionBlock question={openQ?.question ?? null} />
            </MainCard>
            <Rail variant="answers" view={v} myId={myId} currentQid={openQ?.questionId ?? null} />
            <Band slide={4}>
                {openQ ? (
                    <AnswerBand
                        slide={4}
                        question={openQ.question}
                        answerState={v.me.answerState}
                        verdict={v.me.verdicts?.[openQ.questionId]}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(openQ.questionId, value)}
                    />
                ) : (
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ MC mở câu tiếp theo…</span>
                )}
            </Band>
            <Status y={5.23} error={flash} hint={openQ ? `còn ${formatRemaining(remaining)}` : "chờ MC"} />
        </>
    )
}
