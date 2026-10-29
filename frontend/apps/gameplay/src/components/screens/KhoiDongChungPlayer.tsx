import { formatRemaining } from "@shared/lib/clock"
import { Band, Badges, MainCard, Progress, QuestionBlock, Rail, Status, Timer, AnswerBand, type PlayerCtx } from "@shared/deck/player-deck"
import { pt } from "@shared/deck/geometry"

// Khởi động — lượt chung (S2): 6 questions, one shared deadline — squares
// switch, band types. Pure: every value comes from the orchestrator's PlayerCtx.
export function KhoiDongChungPlayer({ ctx }: { ctx: PlayerCtx }) {
    const { v, remaining, myId, flash, s2Q, s2Idx, pickS2, answerBusy, submitAnswer } = ctx
    const open = ctx.open
    const answeredSet = new Set(v.me.answered ?? [])
    return (
        <>
            <MainCard>
                <Badges round="Khởi động" mode="Lượt chung" />
                <Progress
                    total={open.length || 6}
                    done={open.filter((q) => answeredSet.has(q.questionId)).length}
                    active={s2Idx}
                    onPick={(i) => open[i] && pickS2(open[i].questionId, i)}
                />
                <Timer remaining={remaining} fallback="60s" />
                <QuestionBlock question={s2Q?.question ?? null} />
            </MainCard>
            <Rail variant="answers" view={v} myId={myId} currentQid={s2Q?.questionId ?? null} />
            <Band layout="khoi-dong-chung">
                {s2Q ? (
                    <AnswerBand
                        layout="khoi-dong-chung"
                        question={s2Q.question}
                        answerState={answeredSet.has(s2Q.questionId)
                            ? v.me.finalized?.includes(s2Q.questionId) ? "final" : "draft"
                            : "none"}
                        verdict={v.me.verdicts?.[s2Q.questionId]}
                        disabled={open.length === 0}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(s2Q.questionId, value)}
                    />
                ) : (
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Đã hết 60 giây — chờ MC chấm.</span>
                )}
            </Band>
            <Status y={5.24} error={flash} hint={open.length > 0 ? `còn ${formatRemaining(remaining)} · câu ${s2Idx + 1}/${open.length}` : "chờ MC chấm"} />
        </>
    )
}
