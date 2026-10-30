import { useEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react"
import type { LocalVideoTrack } from "livekit-client"
import { useSelfCam } from "@shared/lib/rtc"
import { STRIP_R, pt } from "./geometry"
import {
    type AnswerValue,
    type PlayerQuestion,
    type PlayerView,
    type VeDichCommand,
} from "./types"
import {
    Band,
    Badges,
    CardHeader,
    MainCard,
    Progress,
    QuestionBlock,
    StageLayout,
    Status,
    Timer,
    VeDichStripCells,
    VerdictIcon,
} from "./stage"

// The player deck's surface: shared flow primitives re-exported (one import
// site for screens), plus the player-only pieces — the identity rail, the
// answer/keyword controls, the gate, and the orchestrator's ctx contract.

export {
    Band,
    Badges,
    CardHeader,
    MainCard,
    Progress,
    QuestionBlock,
    StageLayout,
    Status,
    Timer,
    VeDichStripCells,
    VerdictIcon,
}

const inputCls =
    "h-[3.3cqw] min-w-0 flex-1 rounded-lg border border-input bg-background px-[0.9cqw] font-sans text-foreground outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
const submitCls =
    "flex h-[3.3cqw] w-[9.08cqw] shrink-0 items-center justify-center rounded-lg bg-primary font-sans font-semibold uppercase text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
const optionCls = (selected: boolean) =>
    `flex h-[3.3cqw] w-[9.08cqw] shrink-0 items-center justify-center px-[0.4cqw] text-center font-sans font-semibold leading-tight shadow-sm transition ${
        selected
            ? "bg-primary text-primary-foreground ring-2 ring-ring"
            : "bg-muted text-foreground ring-1 ring-border hover:bg-accent"
    }`

/**
 * My own camera inside MY rail card's rectangle — a LOCAL track attached
 * directly (players never subscribe to anyone). The initials stay underneath
 * as the base; cam-off / not-connected falls back to them naturally.
 */
function SelfVideo({ track }: { track: LocalVideoTrack }) {
    const holder = useRef<HTMLSpanElement>(null)
    useEffect(() => {
        const box = holder.current
        if (!box) return
        const video = track.attach()
        video.className = "absolute inset-0 h-full w-full object-cover"
        box.append(video)
        return () => {
            track.detach(video)
            video.remove()
        }
    }, [track])
    return <span ref={holder} className="absolute inset-0 overflow-hidden rounded-lg" aria-hidden />
}

/**
 * Contestant cards — the rail column: initials, name, score, and (on the
 * judging screens) this player's verdict on the open question. THE me-HIGHLIGHT: this
 * player's own card gets a sky ring; the active oral run wears amber.
 */
export function Rail({ variant, view, myId, currentQid }: {
    variant: "compact" | "answers"
    view: PlayerView
    myId: string | null
    currentQid?: string | null
}) {
    const compact = variant === "compact"
    // This player's own broadcast (null outside the match provider — then all
    // cards stay initials, which is exactly right).
    const selfCam = useSelfCam()
    return (
        <>
            {view.table.slice(0, 4).map((row) => {
                const mine = myId !== null && row.id === myId
                const myVerdict = currentQid ? view.me.verdicts?.[currentQid] : undefined
                const activeRun = view.oral?.playerId === row.id
                return (
                    <div
                        key={row.id}
                        title={mine ? "Bạn" : undefined}
                        className={`flex ${compact ? "h-[9.3cqw]" : "h-[11.9cqw]"} shrink-0 flex-col gap-[0.3cqw] overflow-hidden rounded-2xl bg-card p-[0.9cqw] shadow-sm ring-1 ring-border ${mine ? "ring-2 ring-sky-500" : activeRun ? "ring-2 ring-amber-400" : ""}`}
                    >
                        <div className="flex min-h-0 flex-1 gap-[0.7cqw]">
                            <div
                                className="relative flex w-[52%] shrink-0 items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                                style={{ fontSize: pt(16) }}
                                aria-hidden
                            >
                                {row.displayName.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                                {mine && selfCam?.camOn && selfCam.video && <SelfVideo track={selfCam.video} />}
                            </div>
                            <div className="flex min-w-0 flex-1 flex-col justify-start gap-[0.3cqw] pt-[0.2cqw] text-center">
                                <span className="flex min-w-0 items-center justify-center gap-[0.3cqw] font-display font-medium leading-none text-foreground" style={{ fontSize: pt(12) }}>
                                    <span className="truncate">{row.displayName}</span>
                                    {mine && <span className="rounded bg-sky-500 px-[0.3cqw] text-[0.65em] leading-none text-white">BẠN</span>}
                                </span>
                                <span className="font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(compact ? 34 : 44) }}>
                                    {row.points}
                                </span>
                            </div>
                        </div>
                        {!compact && (
                            <div className="flex shrink-0 items-center justify-center gap-[0.4cqw] text-center" style={{ fontSize: pt(12) }}>
                                <span className="inline-flex items-center gap-[0.3cqw] text-muted-foreground">
                                    câu này <VerdictIcon verdict={myVerdict ?? null} />
                                </span>
                            </div>
                        )}
                    </div>
                )
            })}
        </>
    )
}

/**
 * The answer control: MC options land as a strip-width row, text answers take
 * the full band — the player's typed side of the ActionBar.
 */
export function AnswerBand({ question, answerState, verdict, disabled, busy, error, onSubmit }: {
    question: PlayerQuestion | null
    answerState?: "none" | "draft" | "final"
    verdict?: "CORRECT" | "INCORRECT"
    disabled?: boolean
    busy?: boolean
    error?: string | null
    onSubmit: (value: AnswerValue) => void
}) {
    const [draft, setDraft] = useState({ qid: "", picked: "", text: "" })
    const qid = question?.questionId ?? ""
    const state = draft.qid === qid ? draft : { qid, picked: "", text: "" }

    if (!question) {
        return <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Không tải được câu hỏi — hỏi lại MC.</span>
    }

    if (answerState === "draft" || answerState === "final") {
        return (
            <span className="inline-flex items-center gap-[0.5cqw] font-sans font-semibold" style={{ fontSize: pt(12) }}>
                {state.picked || state.text ? `Đã trả lời: ${state.picked || state.text}` : "Đã trả lời"}
                <VerdictIcon verdict={verdict ?? null} />
            </span>
        )
    }

    const options = question.payload.options ?? []
    const isMc = question.kind === "MC" && options.length > 0

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
                        className={`${optionCls(state.picked === option.id)} ${disabled || busy ? "cursor-default opacity-60" : "cursor-pointer"}`}
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
                    className={`${submitCls} ${!state.picked || disabled || busy ? "cursor-default opacity-50" : "cursor-pointer"}`}
                    style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                >
                    {busy ? "…" : "Gửi"}
                </button>
            </div>
        )
    }

    // Text answer: one input + Gửi, filling the band.
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
                placeholder={error ? "không gửi được —Enter để thử lại" : "Câu trả lời của bạn"}
                className={inputCls}
                style={{ fontSize: pt(13) }}
                aria-label="Câu trả lời của bạn"
            />
            <button
                type="button"
                disabled={!state.text.trim() || disabled || busy}
                onClick={() => onSubmit({ text: state.text.trim() })}
                className={`${submitCls} ${!state.text.trim() || disabled || busy ? "cursor-default opacity-50" : "cursor-pointer"}`}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {busy ? "…" : "Gửi"}
            </button>
        </div>
    )
}

/** The keyword box: input + Nộp, derived-draft like AnswerBand. */
export function KeywordBox({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => void }) {
    const [draft, setDraft] = useState({ locked: false, text: "" })
    // `locked` flips true on submit: the box confirms locally until the pushed
    // view carries keywordLocked (the server is the truth either way).
    if (draft.locked) {
        return <span className="inline-flex items-center gap-[0.5cqw] font-sans font-semibold text-emerald-600" style={{ fontSize: pt(12) }}>Đã nộp từ khóa — chờ MC chốt</span>
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
                className={inputCls}
                style={{ fontSize: pt(13) }}
                aria-label="Từ khóa của bạn"
            />
            <button
                type="button"
                disabled={busy || !draft.text.trim()}
                onClick={commit}
                className={`${submitCls} ${busy || !draft.text.trim() ? "cursor-default opacity-50" : "cursor-pointer"}`}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {busy ? "…" : "Nộp"}
            </button>
        </div>
    )
}

/** A centered message — the stage frame stays, the content explains. */
export function Gate({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
    return (
        <div className="flex h-full items-center justify-center p-[6cqw]">
            <div className="flex max-w-xl flex-col items-center gap-[2cqw] rounded-2xl bg-card p-[6cqw] text-center shadow-md ring-1 ring-border">
                <h1 className="font-display text-3xl font-bold uppercase text-foreground">{title}</h1>
                <p className="font-sans text-sm text-muted-foreground">{body}</p>
                {children}
            </div>
        </div>
    )
}


export interface PlayerCtx {
    /** The pushed player view: stage/open/me/board/table/keyword/oral. */
    v: PlayerView
    stage: string
    open: PlayerView["open"]
    remaining: number
    myId: string | null
    /** refusal flash for the Status slots. */
    flash: string | null
    nameOf: (id: string) => string
    /** S2: the question on screen + the square selector. */
    s2Q: PlayerView["open"][number] | undefined
    s2Idx: number
    pickS2: (questionId: string, idx: number) => void
    /** ve-dich board picks (the screen derives toggle/confirm from these). */
    pickedCells: string[]
    setPickedCells: Dispatch<SetStateAction<string[]>>
    /** transport — one wrapper per mutation, versions owned by their hooks. */
    answerBusy: boolean
    submitAnswer: (questionId: string, value: AnswerValue) => void
    keywordBusy: boolean
    submitKeyword: (questionId: string, text: string) => void
    cmdBusy: boolean
    command: (action: VeDichCommand) => void
}
