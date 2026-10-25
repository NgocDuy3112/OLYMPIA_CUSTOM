import { useState, type FormEvent } from "react"
import { ApiError } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { KeyRound, Lock, Sparkles } from "lucide-react"
import { cn } from "cn"
import { useLiveAnswer, useLiveKeyword } from "@/lib/live"
import { AnswerMark, Countdown, type ScreenProps } from "./parts"
import { QuestionForm } from "./QuestionForm"

// giai-ma, the player's side: a hint's 15 s window (when one is open), the
// hints this player has unlocked — WITH their content (G7) — and the keyword
// box, which is open for the WHOLE hint phase (one submission, locks them out).
export function GiaiMaScreen({ view, clock, matchId }: ScreenProps) {
    const answer = useLiveAnswer(matchId)
    const keywordSubmit = useLiveKeyword(matchId)

    const open = view.open[0]
    const me = view.me
    const verdicts = me.verdicts ?? {}
    const keyword = view.keyword

    const [keywordText, setKeywordText] = useState("")

    const answerError =
        answer.isError && !(answer.error instanceof ApiError && answer.error.status === 409)
            ? answer.error.message
            : null
    const keywordError =
        keywordSubmit.isError && !(keywordSubmit.error instanceof ApiError && keywordSubmit.error.status === 409)
            ? keywordSubmit.error.message
            : null

    const locked = me.keywordLocked === true
    const eliminated = me.eliminated === true

    const submitKeyword = (event: FormEvent) => {
        event.preventDefault()
        if (!keyword || locked || !keywordText.trim() || keywordSubmit.isPending) return
        keywordSubmit.mutate(
            { questionId: keyword.questionId, value: { text: keywordText.trim() } },
            { onSuccess: () => setKeywordText("") }
        )
    }

    return (
        <div className="flex flex-col gap-4">
            {/* ── the hint window (or the wait between windows) ── */}
            {open ? (
                <section className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold">
                            <Sparkles className="size-4 text-primary" aria-hidden />
                            Gợi ý đang mở
                        </span>
                        <Countdown deadlineAt={open.deadlineAt} clock={clock} label="còn" />
                    </div>
                    <QuestionForm
                        key={open.questionId}
                        question={open.question}
                        answerState={me.answerState}
                        verdict={verdicts[open.questionId]}
                        onSubmit={(value) => answer.mutate({ questionId: open.questionId, value })}
                        submitting={answer.isPending}
                        error={answerError}
                        submitLabel="Trả lời gợi ý"
                    />
                </section>
            ) : (
                <section className="flex flex-col items-center gap-2 rounded-xl border bg-card p-6 text-center">
                    <p className="font-heading text-lg font-semibold">Chờ MC mở gợi ý</p>
                    <p className="text-sm text-muted-foreground">
                        Bạn đã mở <span className="font-semibold text-foreground">{me.hintsRevealed ?? 0}</span> gợi ý.
                        Trang tự cập nhật.
                    </p>
                </section>
            )}

            {/* ── the hints this player unlocked, with content (G7) ── */}
            {(me.revealedHints?.length ?? 0) > 0 && (
                <section className="rounded-xl border bg-card p-4">
                    <h3 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        <Sparkles className="size-4" aria-hidden />
                        Gợi ý của bạn ({me.revealedHints!.length})
                    </h3>
                    <ul className="mt-3 flex flex-col gap-2">
                        {me.revealedHints!.map((hint) => (
                            <li key={hint.questionId} className="rounded-lg border border-dashed px-3 py-2 text-sm">
                                {hint.question?.questionText ?? hint.questionId}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* ── the keyword box ── */}
            {keyword && (
                <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            <KeyRound className="size-4" aria-hidden />
                            Từ khóa
                        </h3>
                        {!eliminated && me.keywordValue !== null && me.keywordValue !== undefined && (
                            <span
                                className={cn(
                                    "rounded-full px-3 py-1 text-xs font-semibold tabular-nums",
                                    locked ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                                )}
                            >
                                {me.keywordValue} điểm
                            </span>
                        )}
                    </div>

                    {keyword.question && (
                        <p className="text-base leading-relaxed">{keyword.question.questionText}</p>
                    )}

                    {eliminated ? (
                        <p className="rounded-lg border border-red-500/40 bg-red-500/5 px-3 py-2.5 text-sm text-red-600">
                            Bạn đã không giải được từ khóa — bị loại khỏi Giải mã.
                            Các vòng sau bạn vẫn thi bình thường.
                        </p>
                    ) : locked ? (
                        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                            <Lock className="size-4" aria-hidden />
                            Đã khóa từ khóa
                            <AnswerMark answerState="final" verdict={verdicts[keyword.questionId]} />
                        </div>
                    ) : (
                        <form onSubmit={submitKeyword} className="flex flex-col gap-3">
                            <input
                                type="text"
                                value={keywordText}
                                onChange={(event) => setKeywordText(event.target.value)}
                                placeholder="Từ khóa của bạn"
                                aria-label="Từ khóa của bạn"
                                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
                            />
                            {keywordError && <p role="alert" className="text-sm text-destructive">{keywordError}</p>}
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-xs text-muted-foreground">
                                    Nộp một lần là chốt: đúng nhận điểm, sai bị loại.
                                </span>
                                <Button
                                    type="submit"
                                    disabled={!keywordText.trim() || keywordSubmit.isPending}
                                >
                                    {keywordSubmit.isPending ? "Đang nộp…" : "Nộp từ khóa"}
                                </Button>
                            </div>
                        </form>
                    )}
                </section>
            )}
        </div>
    )
}
