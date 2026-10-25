import { ApiError } from "@shared/lib/api"
import { cn } from "cn"
import { useLiveAnswer, type AnswerValue } from "@/lib/live"
import { Countdown, AnswerMark, BudgetBar, type ScreenProps } from "./parts"
import { QuestionForm } from "./QuestionForm"

// ── khoi-dong phase 1 · oral ─────────────────────────────────────────────────

// Decision 2310: the oral question is on EVERY seated player's screen, like the
// show's projection. Nobody types here — the MC records the run — so this screen
// watches: whose run it is, which question, and the consumed budget BAR (never a
// countdown: the engine counts only what the MC records — G2).
export function KhoiDongOralScreen({ view }: ScreenProps) {
    const oral = view.oral
    const activeName = view.table.find((row) => row.id === oral?.playerId)?.displayName
    const myRun = view.me.isMyRun === true

    if (!oral) {
        // Between runs (or before phase 1 starts): no current question to project.
        return (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
                <p className="font-heading text-lg font-semibold">Phần hỏi đáp miệng</p>
                <p className="text-sm text-muted-foreground">
                    MC đang gọi thí sinh tiếp theo — trang tự cập nhật.
                </p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div
                className={cn(
                    "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4",
                    myRun ? "border-primary bg-primary/5" : "bg-card"
                )}
            >
                <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums text-muted-foreground">
                        Câu {oral.index + 1}/{oral.total}
                    </span>
                    {myRun ? (
                        <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                            ĐẾN LƯỢT BẠN
                        </span>
                    ) : (
                        <span className="text-sm">
                            Đang thi: <span className="font-medium">{activeName ?? "…"}</span>
                        </span>
                    )}
                </div>
                <span className="text-sm text-muted-foreground">Mọi thí sinh cùng xem câu hỏi</span>
            </div>

            <QuestionForm question={oral.question} readOnly />

            <div className="rounded-xl border bg-card p-4">
                <BudgetBar elapsedS={oral.elapsedS} budgetS={oral.budgetS} />
                <p className="mt-2 text-xs text-muted-foreground">
                    Thời gian tính khi MC chấm — đồng hồ tự chạy khi MC ghi nhận.
                </p>
            </div>
        </div>
    )
}

// ── khoi-dong phase 2 · batch ────────────────────────────────────────────────

// The whole field answers 6 questions at once against ONE shared deadline — the
// countdown is the server's instant (phase2OpenedAt + 60) on the shared clock.
export function KhoiDongBatchScreen({ view, clock, matchId }: ScreenProps) {
    const answer = useLiveAnswer(matchId)
    const open = view.open
    const deadlineAt = open[0]?.deadlineAt ?? null

    const answered = new Set(view.me.answered ?? [])
    const finalized = new Set(view.me.finalized ?? [])
    const verdicts = view.me.verdicts ?? {}

    const stateFor = (questionId: string): "none" | "draft" | "final" =>
        finalized.has(questionId) ? "final" : answered.has(questionId) ? "draft" : "none"

    const submitError =
        answer.isError && !(answer.error instanceof ApiError && answer.error.status === 409)
            ? answer.error.message
            : null

    if (open.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
                <p className="font-heading text-lg font-semibold">Đã hết 60 giây</p>
                <p className="text-sm text-muted-foreground">
                    Ban tổ chức đã đóng phần trả lời nhanh — chờ MC chấm và chuyển phần.
                </p>
                <p className="text-sm font-semibold tabular-nums">Điểm của bạn: {view.me.points ?? 0}</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                <span className="text-sm text-muted-foreground">
                    Cùng trả lời {open.length} câu — ai nấy gõ, tự chấm.
                </span>
                <div className="flex items-center gap-4">
                    <Countdown deadlineAt={deadlineAt} clock={clock} label="còn" />
                    <span className="text-sm font-semibold tabular-nums">
                        {view.me.points ?? 0} điểm
                    </span>
                </div>
            </div>

            {submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}

            <div className="flex flex-col gap-4">
                {open.map((entry, index) => (
                    <div key={entry.questionId} className="flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-medium text-muted-foreground">
                                Câu {index + 1}
                            </span>
                            <AnswerMark
                                answerState={stateFor(entry.questionId)}
                                verdict={verdicts[entry.questionId]}
                            />
                        </div>
                        <QuestionForm
                            question={entry.question}
                            answerState={stateFor(entry.questionId)}
                            verdict={verdicts[entry.questionId]}
                            onSubmit={(value: AnswerValue) =>
                                answer.mutate({ questionId: entry.questionId, value })
                            }
                            submitting={answer.isPending}
                        />
                    </div>
                ))}
            </div>
        </div>
    )
}
