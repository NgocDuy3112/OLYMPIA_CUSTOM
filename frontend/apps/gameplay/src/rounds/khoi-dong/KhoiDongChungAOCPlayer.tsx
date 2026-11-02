import { formatRemaining } from "@shared/lib/clock"
import { AnswerBand, PlayerStage, Progress, QuestionFrame, Rail, Timer, type PlayerCore } from "@shared/deck/player-deck"
import { pt } from "@shared/deck/geometry"
import type { AnswerValue, PlayerView } from "@shared/deck/types"

// Khởi động — lượt chung (S2): 6 questions, one shared deadline — squares
// switch, band types. Pure: every value comes from the orchestrator, narrowed
// to what this screen actually reads (`PlayerCore & { … }`).
export type KhoiDongChungPlayerCtx = PlayerCore & {
    remaining: number
    /** the question on screen (the square this player is looking at) */
    s2Q: PlayerView["open"][number] | undefined
    s2Idx: number
    pickS2: (questionId: string, idx: number) => void
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
}

/** The answer's state for one question: never answered, staged, or frozen. */
function answerStateOf(view: PlayerView, questionId: string): "none" | "draft" | "final" {
    if (!(view.me.answered ?? []).includes(questionId)) return "none"
    return (view.me.finalized ?? []).includes(questionId) ? "final" : "draft"
}

export function KhoiDongChungAOCPlayer({ ctx }: { ctx: KhoiDongChungPlayerCtx }) {
    const { v, remaining, myId, flash, s2Q, s2Idx, pickS2, answerBusy, submitAnswer } = ctx
    const open = ctx.open
    const answeredSet = new Set(v.me.answered ?? [])
    return (
        <PlayerStage
            rail={<Rail variant="answers" view={v} myId={myId} currentQid={s2Q?.questionId ?? null} />}
            band={
                s2Q ? (
                    <AnswerBand
                        question={s2Q.question}
                        answerState={answerStateOf(v, s2Q.questionId)}
                        verdict={v.me.verdicts?.[s2Q.questionId]}
                        disabled={open.length === 0}
                        busy={answerBusy}
                        error={flash}
                        onSubmit={(value) => submitAnswer(s2Q.questionId, value)}
                    />
                ) : (
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Đã hết 60 giây — chờ MC chấm.</span>
                )
            }
            hint={open.length > 0 ? `còn ${formatRemaining(remaining)} · câu ${s2Idx + 1}/${open.length}` : "chờ MC chấm"}
            flash={flash}
        >
            <QuestionFrame
                round="Khởi động"
                mode="Lượt chung"
                right={
                    <>
                        <Progress
                            total={open.length || 6}
                            done={open.filter((q) => answeredSet.has(q.questionId)).length}
                            active={s2Idx}
                            onPick={(i) => open[i] && pickS2(open[i].questionId, i)}
                        />
                        <Timer remaining={remaining} fallback="60s" />
                    </>
                }
                question={s2Q?.question?.questionText ?? null}
                media={s2Q?.question?.media ?? null}
            />
        </PlayerStage>
    )
}
