import { ApiError } from "@shared/lib/api"
import { useLiveAnswer } from "@/lib/live"
import { Countdown, type ScreenProps } from "./parts"
import { QuestionForm } from "./QuestionForm"

// but-pha: ONE question at a time, 30 s, typed — the server enforces the window
// by its own clock, the display only tells the truth about it. One attempt per
// question (a second POST is refused with ALREADY_ANSWERED → the view corrects).
export function ButPhaScreen({ view, clock, matchId }: ScreenProps) {
    const answer = useLiveAnswer(matchId)
    const open = view.open[0]
    const verdicts = view.me.verdicts ?? {}

    const submitError =
        answer.isError && !(answer.error instanceof ApiError && answer.error.status === 409)
            ? answer.error.message
            : null

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <span className="text-sm text-muted-foreground">
                    Trả lời nhanh — điểm theo tốc độ, chỉ chọn một lần.
                </span>
                <div className="flex items-center gap-4">
                    {open && <Countdown deadlineAt={open.deadlineAt} clock={clock} label="còn" />}
                    <span className="text-sm font-semibold tabular-nums">
                        {view.me.points ?? 0} điểm
                    </span>
                </div>
            </div>

            {open ? (
                <QuestionForm
                    key={open.questionId}
                    question={open.question}
                    answerState={view.me.answerState}
                    verdict={verdicts[open.questionId]}
                    onSubmit={(value) => answer.mutate({ questionId: open.questionId, value })}
                    submitting={answer.isPending}
                    error={submitError}
                />
            ) : (
                <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-8 text-center">
                    <p className="font-heading text-lg font-semibold">Chờ MC</p>
                    <p className="text-sm text-muted-foreground">
                        MC đang chấm câu trước hoặc mở câu kế tiếp — trang tự cập nhật.
                    </p>
                </div>
            )}
        </div>
    )
}
