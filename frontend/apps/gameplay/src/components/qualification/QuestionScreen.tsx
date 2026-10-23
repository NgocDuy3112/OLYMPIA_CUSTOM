import { useEffect, useState, type FormEvent } from "react"
import { Button } from "@shared/ui/button"
import { cn } from "cn"
import {
    answered,
    isAnswerable,
    type DotState,
    type QualificationView,
    type ReleasedQuestion,
} from "@/lib/qualification-state"

// One question at a time, laptop-first: a centered card, full-width option rows
// for the mouse, Enter submits. Doubles as the read-only review (everything
// locked when the turn — or the event — has moved past).

export interface JustAnswered {
    questionId: string
    verdict: "CORRECT" | "INCORRECT"
    value: { picked?: string[]; text?: string }
}

interface QuestionScreenProps {
    view: QualificationView
    /** The released set, sorted — this wizard walks only within it. */
    released: ReleasedQuestion[]
    /** Index the wizard opens at: the current turn (or the last question in review). */
    initialIndex: number
    /** Remount key: the turn changing resets navigation to the new current. */
    turnKey: string
    dots: DotState[]
    /** The just-submitted verdict, shown even before the refetch lands. */
    justAnswered?: JustAnswered | null
    /** Review mode: no input, no banner, no submit — verdicts and misses only. */
    review?: boolean
    onAnswer?: (questionId: string, value: { picked?: string[]; text?: string }) => void
    submitting?: boolean
    submitError?: string | null
    /** "Câu tiếp" on the fresh banner. */
    onAdvancePast?: () => void
}

const DOT_STYLE: Record<DotState, string> = {
    correct: "bg-emerald-500",
    wrong: "bg-red-500",
    missed: "bg-muted-foreground/40",
    current: "ring-2 ring-primary ring-offset-2 ring-offset-background bg-background border border-border",
    future: "bg-muted",
}

const DOT_LABEL: Record<DotState, string> = {
    correct: "đúng",
    wrong: "sai",
    missed: "không trả lời",
    current: "câu hiện tại",
    future: "chưa phát",
}

export function Dots({
    dots,
    activeIndex,
    onPick,
}: {
    dots: DotState[]
    activeIndex: number
    onPick?: (index: number) => void
}) {
    return (
        <ol className="flex flex-wrap items-center gap-2" aria-label="Tiến độ">
            {dots.map((state, index) => {
                const dot = (
                    <span
                        className={cn("block size-3 rounded-full", DOT_STYLE[state])}
                        aria-hidden
                    />
                )
                return (
                    <li key={index}>
                        {onPick ? (
                            <button
                                type="button"
                                onClick={() => onPick(index)}
                                aria-label={`Câu ${index + 1}: ${DOT_LABEL[state]}`}
                                aria-current={index === activeIndex || undefined}
                                className={cn(
                                    "rounded-full p-1 transition-opacity",
                                    index === activeIndex ? "" : "opacity-70 hover:opacity-100"
                                )}
                            >
                                {dot}
                            </button>
                        ) : (
                            <span
                                className="block p-1"
                                aria-label={`Câu ${index + 1}: ${DOT_LABEL[state]}`}
                            >
                                {dot}
                            </span>
                        )}
                    </li>
                )
            })}
        </ol>
    )
}

export function QuestionScreen({
    view,
    released,
    initialIndex,
    turnKey,
    dots,
    justAnswered,
    review = false,
    onAnswer,
    submitting = false,
    submitError,
    onAdvancePast,
}: QuestionScreenProps) {
    const [index, setIndex] = useState(initialIndex)
    // Choices survive prev/next inside the wizard: coming back keeps your pick.
    const [picks, setPicks] = useState<Record<string, string>>({})
    const [text, setText] = useState<Record<string, string>>({})

    useEffect(() => {
        setIndex(initialIndex)
        // turnKey is the dependency that matters: a new turn lands on the new question.
    }, [turnKey, initialIndex])

    const question = released[Math.min(index, released.length - 1)]
    if (!question) return null

    const viewAnswer = answered(view, question.questionId)
    const fresh = justAnswered?.questionId === question.questionId ? justAnswered : null
    const answer = viewAnswer ?? (fresh ? { verdict: fresh.verdict, value: fresh.value } : undefined)
    const answerable = !review && !answer && isAnswerable(view, question)
    const isMissed = !answerable && !answer   // released, never answered, not the turn

    const picked = picks[question.questionId]
    const typed = text[question.questionId] ?? ""
    const options = question.payload.options ?? []
    const isTyped = question.kind !== "MC"

    const submit = (event: FormEvent) => {
        event.preventDefault()
        if (!answerable || !onAnswer) return
        if (isTyped) {
            if (!typed.trim()) return
            onAnswer(question.questionId, { text: typed.trim() })
        } else {
            if (!picked) return
            onAnswer(question.questionId, { picked: [picked] })
        }
    }

    const go = (next: number) => {
        if (next < 0 || next >= released.length) return
        setIndex(next)
    }

    // The banner is the moment after submit: it stays while `fresh` lives (the
    // container holds it until Câu tiếp or a new turn), regardless of the refetch.
    const showFreshBanner = Boolean(fresh)

    return (
        <div className="flex w-full flex-col gap-5">
            {/* header: dots + counter */}
            <div className="flex items-center justify-between gap-4">
                <Dots dots={dots} activeIndex={index} onPick={go} />
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    Câu {index + 1}/{view.totalQuestions}
                    {answerable && <span className="ml-2 font-medium text-foreground">· đang mở</span>}
                </span>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-5 rounded-xl border bg-card p-6">
                {question.media && question.media.type === "image" && (
                    <img
                        src={question.media.url}
                        alt=""
                        className="max-h-72 w-full rounded-lg object-contain bg-muted"
                    />
                )}
                {question.media && question.media.type === "audio" && (
                    <audio controls src={question.media.url} className="w-full" />
                )}
                {question.media && question.media.type === "video" && (
                    <video controls src={question.media.url} className="w-full rounded-lg" />
                )}

                <p className="text-xl font-medium leading-relaxed">{question.questionText}</p>

                {isTyped ? (
                    <input
                        type="text"
                        value={typed}
                        disabled={!answerable}
                        onChange={(event) =>
                            setText((current) => ({ ...current, [question.questionId]: event.target.value }))
                        }
                        placeholder="Câu trả lời của bạn"
                        className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
                        aria-label="Câu trả lời của bạn"
                    />
                ) : (
                    <fieldset className="flex flex-col gap-2" disabled={!answerable}>
                        {options.map((option, position) => {
                            const chosen = picked === option.id
                            const chosenAndWrong = Boolean(answer) && answer!.verdict === "INCORRECT" && chosen
                            const chosenAndRight = Boolean(answer) && answer!.verdict === "CORRECT" && chosen
                            return (
                                <label
                                    key={option.id}
                                    className={cn(
                                        "flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base transition-colors",
                                        answerable && "hover:bg-muted/60",
                                        !answerable && "cursor-default",
                                        chosen && answerable && "border-primary bg-primary/5",
                                        chosenAndWrong && "border-red-500/60 bg-red-500/5",
                                        chosenAndRight && "border-emerald-500/60 bg-emerald-500/5",
                                        !answerable && !chosen && "opacity-70"
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name={question.questionId}
                                        checked={chosen}
                                        onChange={() =>
                                            setPicks((current) => ({ ...current, [question.questionId]: option.id }))
                                        }
                                        className="size-4 accent-primary"
                                    />
                                    <span className="font-medium text-muted-foreground">
                                        {String.fromCharCode(65 + position)}.
                                    </span>
                                    <span className="flex-1">{option.text}</span>
                                    {chosen && answer && (
                                        <span
                                            className={cn(
                                                "text-sm font-semibold",
                                                answer.verdict === "CORRECT" ? "text-emerald-600" : "text-red-600"
                                            )}
                                        >
                                            {answer.verdict === "CORRECT" ? "✓ của tôi" : "✗ của tôi"}
                                        </span>
                                    )}
                                </label>
                            )
                        })}
                    </fieldset>
                )}

                {isMissed && (
                    <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                        Bạn không trả lời câu này — ban tổ chức đã sang câu tiếp theo.
                    </p>
                )}

                {answer && (
                    <div
                        role="status"
                        className={cn(
                            "flex items-center justify-between gap-3 rounded-lg border px-4 py-3",
                            answer.verdict === "CORRECT"
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                : "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300"
                        )}
                    >
                        <span className="font-semibold">
                            {answer.verdict === "CORRECT" ? "✓ Đúng!" : "✗ Chưa đúng"}
                        </span>
                        {showFreshBanner && onAdvancePast && (
                            <Button
                                type="button"
                                size="sm"
                                variant={answer.verdict === "CORRECT" ? "default" : "outline"}
                                onClick={onAdvancePast}
                            >
                                Câu tiếp →
                            </Button>
                        )}
                    </div>
                )}

                {submitError && (
                    <p role="alert" className="text-sm text-destructive">{submitError}</p>
                )}

                {answerable && (
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                            {isTyped
                                ? typed.trim()
                                    ? "Enter để trả lời"
                                    : "Nhập câu trả lời trước"
                                : picked
                                    ? "Enter để trả lời"
                                    : "Chọn một đáp án trước"}
                        </span>
                        <Button
                            type="submit"
                            disabled={submitting || (isTyped ? !typed.trim() : !picked)}
                        >
                            {submitting ? "Đang trả lời…" : "Trả lời"}
                        </Button>
                    </div>
                )}
            </form>

            {/* navigation: prev through answered history, next toward the turn */}
            <div className="flex items-center justify-between gap-3">
                <Button
                    type="button"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => go(index - 1)}
                >
                    ◀ Câu trước
                </Button>
                <span className="text-xs text-muted-foreground">
                    {view.answers.length}/{view.totalQuestions} đã trả lời
                </span>
                <Button
                    type="button"
                    variant="ghost"
                    disabled={index >= released.length - 1}
                    onClick={() => go(index + 1)}
                >
                    Câu sau ▶
                </Button>
            </div>
        </div>
    )
}
