import { useState } from "react"
import { STRIP_R, pt } from "./geometry"
import { COPY } from "./copy"
import type { AnswerValue, PlayerQuestion } from "./types"

const INPUT =
    "h-[3.3cqw] min-w-0 flex-1 rounded-lg border border-input bg-background px-[0.9cqw] font-sans text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
const SUBMIT =
    "flex h-[3.3cqw] w-[9.08cqw] shrink-0 items-center justify-center rounded-lg bg-primary font-sans font-semibold uppercase text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"

const optionClass = (selected: boolean): string =>
    `flex h-[3.3cqw] w-[9.08cqw] shrink-0 items-center justify-center px-[0.4cqw] text-center font-sans font-semibold leading-tight shadow-sm transition ${
        selected
            ? "bg-primary text-primary-foreground ring-2 ring-ring"
            : "bg-muted text-foreground ring-1 ring-border hover:bg-accent"
    }`

const submitClass = (ready: boolean): string =>
    `${SUBMIT} ${ready ? "cursor-pointer" : "cursor-default opacity-50"}`

export function AnswerBand({ question, disabled, busy, error, onSubmit }: {
    question: PlayerQuestion | null
    answerState?: "none" | "draft" | "final"
    disabled?: boolean
    busy?: boolean
    error?: string | null
    onSubmit: (value: AnswerValue) => void
}) {
    const [draft, setDraft] = useState({ qid: "", picked: "", text: "" })
    const qid = question?.questionId ?? ""
    const state = draft.qid === qid ? draft : { qid, picked: "", text: "" }

    if (!question) {
        return <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}></span>
    }
    const options = question.payload.options ?? []
    const isMc = question.kind === "CHOICE" && options.length > 0

    if (isMc) {
        return (
            <div className="flex w-full items-center gap-[1cqw]">
                {options.map((option, i) => (
                    <button
                        key={option.id}
                        type="button"
                        disabled={disabled || busy}
                        title={option.text}
                        onClick={() => setDraft({ qid, picked: option.id, text: "" })}
                        className={optionClass(state.picked === option.id)}
                        style={{ fontSize: pt(10), borderRadius: STRIP_R }}
                    >
                        <span className="truncate">
                            <b>{String.fromCharCode(65 + i)}.</b> {option.text}
                        </span>
                    </button>
                ))}
                <button
                    type="button"
                    disabled={!state.picked || disabled || busy}
                    onClick={() => onSubmit({ picked: [state.picked] })}
                    className={submitClass(Boolean(state.picked) && !disabled && !busy)}
                    style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                >
                    {busy ? "…" : COPY.send}
                </button>
            </div>
        )
    }

    return (
        <div className="flex w-full items-center gap-[1cqw]">
            <input
                type="text"
                value={state.text}
                disabled={disabled || busy}
                onChange={(event) => setDraft({ qid, text: event.target.value, picked: "" })}
                onKeyDown={(event) => {
                    if (event.key === "Enter" && state.text.trim() && !disabled && !busy) {
                        onSubmit({ text: state.text.trim() })
                    }
                }}
                placeholder={error ? "Bấm nút Gửi để thử lại" : "Câu trả lời của bạn"}
                className={INPUT}
                style={{ fontSize: pt(13) }}
                aria-label="Câu trả lời của bạn"
            />
            <button
                type="button"
                disabled={!state.text.trim() || disabled || busy}
                onClick={() => onSubmit({ text: state.text.trim() })}
                className={submitClass(Boolean(state.text.trim()) && !disabled && !busy)}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {busy ? "…" : COPY.send}
            </button>
        </div>
    )
}

export function AnswerBandIdle() {
    return (
        <div className="flex w-full items-center gap-[1cqw]">
            <input
                type="text"
                value=""
                readOnly
                disabled
                className={INPUT}
                style={{ fontSize: pt(13) }}
                aria-label="Câu trả lời của bạn"
            />
            <button
                type="button"
                disabled
                className={submitClass(false)}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {COPY.send}
            </button>
        </div>
    )
}

export function KeywordBox({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => void }) {
    const [draft, setDraft] = useState({ locked: false, text: "" })
    if (draft.locked) {
        return <span className="inline-flex items-center gap-[0.5cqw] font-sans font-semibold text-emerald-600" style={{ fontSize: pt(12) }}>Đã nộp từ khóa — chờ điều hành chốt</span>
    }
    const commit = () => {
        if (!draft.text.trim() || busy) return
        onSubmit(draft.text.trim())
        setDraft({ locked: true, text: draft.text })
    }
    return (
        <div className="flex w-full items-center gap-[1cqw]">
            <input
                type="text"
                value={draft.text}
                disabled={busy}
                onChange={(event) => setDraft({ locked: false, text: event.target.value })}
                onKeyDown={(event) => {
                    if (event.key === "Enter") commit()
                }}
                placeholder="Từ khóa của bạn — chốt một lần"
                className={INPUT}
                style={{ fontSize: pt(13) }}
                aria-label="Từ khóa của bạn"
            />
            <button
                type="button"
                disabled={busy || !draft.text.trim()}
                onClick={commit}
                className={submitClass(!busy && Boolean(draft.text.trim()))}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {busy ? "…" : COPY.submit}
            </button>
        </div>
    )
}
