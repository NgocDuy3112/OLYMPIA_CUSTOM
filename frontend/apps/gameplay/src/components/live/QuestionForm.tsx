import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@shared/ui/button"
import { cn } from "cn"
import type { AnswerValue, LiveQuestion } from "@/lib/live"
import { AnswerMark } from "./parts"

// One question, one input, one submit — the shared body of every answering
// screen (khoi-dong phase 2, giai-ma's hint window, but-pha, ve-dich phase 1).
// The screen around it owns the countdown and the round-specific copy; this
// component owns media, options, the typed answer, and the ✓/✗ state row.
//
// Mount it with `key={question.questionId}` — a new question starts a clean
// form (the local pick/text never leaks from one question to the next).

export interface QuestionFormProps {
    question: LiveQuestion | null
    answerState?: "none" | "draft" | "final"
    verdict?: "CORRECT" | "INCORRECT"
    /** Omitted in read-only displays (projected oral questions). */
    onSubmit?: (value: AnswerValue) => void
    submitting?: boolean
    /** Non-409 refusals only — a 409 is a race the server won; the view corrects it. */
    error?: string | null
    /** Window closed / locked out: inputs off, with the reason said out loud. */
    disabled?: boolean
    disabledReason?: string | null
    submitLabel?: string
    /** No inputs at all — the form is a display (projected question, review). */
    readOnly?: boolean
    /** Countdown row under the form (screens pass the shared clock's). */
    footer?: ReactNode
}

export function QuestionForm({
    question,
    answerState,
    verdict,
    onSubmit,
    submitting = false,
    error,
    disabled = false,
    disabledReason,
    submitLabel = "Trả lời",
    readOnly = false,
    footer,
}: QuestionFormProps) {
    const [picked, setPicked] = useState("")
    const [text, setText] = useState("")

    const questionId = question?.questionId ?? ""
    useEffect(() => {
        setPicked("")
        setText("")
    }, [questionId])

    if (!question) {
        // The id is known but the payload did not arrive — say so, never crash.
        return (
            <div className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">
                Không tải được nội dung câu hỏi — hỏi lại MC.
            </div>
        )
    }

    const answered = answerState === "draft" || answerState === "final"
    const options = question.payload.options ?? []
    const isMc = question.kind === "MC" && options.length > 0
    // Inputs lock only when the moment has passed (submitted, closed, in flight) —
    // NEVER just because the field is empty: an empty box must stay typable.
    const locked = answered || disabled || submitting || !onSubmit
    const canSubmit = !locked && (isMc ? picked !== "" : text.trim() !== "")

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (!canSubmit || !onSubmit) return
        onSubmit(isMc ? { picked: [picked] } : { text: text.trim() })
    }

    return (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border bg-card p-6">
            {question.media?.type === "image" && (
                <img src={question.media.url} alt="" className="max-h-72 w-full rounded-lg object-contain bg-muted" />
            )}
            {question.media?.type === "audio" && <audio controls src={question.media.url} />}
            {question.media?.type === "video" && (
                <video controls src={question.media.url} className="w-full rounded-lg" />
            )}

            <p className="text-xl font-medium leading-relaxed">{question.questionText}</p>

            {answered ? (
                // Submitted: show what I picked/typed (if still local) + the mark.
                <div className="flex flex-col gap-2">
                    {(picked || text.trim()) && (
                        <p className="text-sm text-muted-foreground">
                            Câu trả lời của bạn: <span className="font-medium text-foreground">{picked || text.trim()}</span>
                        </p>
                    )}
                    <AnswerMark answerState={answerState} verdict={verdict} />
                </div>
            ) : readOnly ? null : isMc ? (
                <fieldset className="flex flex-col gap-2" disabled={locked}>
                    {options.map((option, position) => (
                        <label
                            key={option.id}
                            className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base transition-colors",
                                canSubmit && "hover:bg-muted/60",
                                !canSubmit && "cursor-default opacity-70",
                                picked === option.id && "border-primary bg-primary/5"
                            )}
                        >
                            <input
                                type="radio"
                                name={question.questionId}
                                checked={picked === option.id}
                                onChange={() => setPicked(option.id)}
                                className="size-4 accent-primary"
                            />
                            <span className="font-medium text-muted-foreground">{String.fromCharCode(65 + position)}.</span>
                            <span className="flex-1">{option.text}</span>
                        </label>
                    ))}
                </fieldset>
            ) : (
                <input
                    type="text"
                    value={text}
                    disabled={locked}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Câu trả lời của bạn"
                    className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
                    aria-label="Câu trả lời của bạn"
                />
            )}

            {disabled && disabledReason && (
                <p className="text-sm text-muted-foreground">{disabledReason}</p>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            {footer}

            {!readOnly && !answered && (
                <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted-foreground">
                        {isMc
                            ? picked ? "Gửi câu trả lời" : "Chọn một đáp án trước"
                            : text.trim() ? "Gửi câu trả lời" : "Nhập câu trả lời trước"}
                    </span>
                    <Button type="submit" disabled={!canSubmit}>
                        {submitting ? "Đang gửi…" : submitLabel}
                    </Button>
                </div>
            )}
        </form>
    )
}
