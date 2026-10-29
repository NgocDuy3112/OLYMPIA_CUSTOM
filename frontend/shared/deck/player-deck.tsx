import { useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react"
import { CheckCircle2, Hourglass, XCircle } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { DECK_PAD, STRIP_R, px, py, pt } from "./geometry"
import {
    type AnswerValue,
    type PlayerQuestion,
    type PlayerView,
    type VeDichCommand,
} from "./types"


const BAND: Record<number, { x: number; y: number; w: number }> = {
    1: { x: 2.25, y: 4.69, w: 5.21 },
    2: { x: 2.31, y: 4.69, w: 5.22 },
    3: { x: 2.31, y: 6.52, w: 5.22 },
    4: { x: 2.37, y: 4.68, w: 5.22 },
    56: { x: 2.9, y: 4.9, w: 3.79 },
    7: { x: 2.38, y: 4.67, w: 5.23 },
    8: { x: 1.66, y: 4.67, w: 6.53 },
}

const STRIP_XS: Record<number, number[]> = {
    1: [2.25, 3.59, 4.92, 6.25],
    2: [2.31, 3.65, 4.98, 6.32],
    3: [2.31, 3.65, 4.98, 6.32],
    4: [2.37, 3.71, 5.04, 6.38],
    56: [2.9, 4.21, 5.49],
    7: [2.38, 3.72, 5.05, 6.38],
    8: [1.66, 2.99, 4.31, 5.64, 6.98],
}
export type BandId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 56
export type SlideId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const inputCls =
    "h-full min-h-[1.9em] flex-1 rounded-lg border border-input bg-background px-3 font-sans text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
const submitCls =
    "flex h-full min-h-[1.9em] items-center justify-center rounded-lg bg-primary px-4 font-sans text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
const optionCls = (selected: boolean) =>
    `flex items-center justify-center gap-1 rounded-lg px-2 text-center font-sans font-semibold shadow-sm transition ${
        selected ? "bg-primary text-primary-foreground ring-2 ring-ring" : "bg-muted text-foreground ring-1 ring-border hover:bg-accent"
    }`


export function Box({
    x, y, w, h, className = "", style, onClick, title, children,
}: {
    x: number; y: number; w?: number; h?: number
    className?: string; style?: CSSProperties; onClick?: () => void; title?: string; children?: ReactNode
}) {
    return (
        <div
            className={`absolute ${className}`}
            onClick={onClick}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault()
                    onClick()
                }
            } : undefined}
            title={title}
            style={{
                left: px(x), top: py(y),
                ...(w !== undefined ? { width: px(w) } : {}),
                ...(h !== undefined ? { height: py(h) } : {}),
                ...style,
            }}
        >
            {children}
        </div>
    )
}

export function Badges({ round, mode, y = 0.55, size = 32 }: { round: string; mode?: string; y?: number; size?: number }) {
    return (
        <>
            <Box x={0.59} y={y} className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
                {round}
            </Box>
            {mode && (
                <Box x={0.6} y={y + 0.42} className="font-display font-medium leading-none text-muted-foreground" style={{ fontSize: pt(16), ...DECK_PAD }}>
                    {mode}
                </Box>
            )}
        </>
    )
}

/** Progress squares (0.26, right-aligned to x 8.46) — tap = switch question (S2). */
export function Progress({ total, done, active, onPick }: { total: number; done: number; active: number; onPick?: (i: number) => void }) {
    const startX = 8.46 - (total * 0.26 + (total - 1) * 0.13)
    return (
        <>
            {Array.from({ length: total }, (_, i) => (
                <Box
                    key={i}
                    x={startX + i * 0.39} y={0.78} w={0.26} h={0.26}
                    onClick={onPick ? () => onPick(i) : undefined}
                    className={`flex items-center justify-center font-display font-bold leading-none ${
                        i < done
                            ? "bg-primary text-primary-foreground"
                            : i === active
                              ? "bg-card text-foreground ring-2 ring-primary"
                              : "bg-card text-muted-foreground ring-1 ring-border"
                    } ${onPick ? "cursor-pointer hover:ring-sky-500" : ""}`}
                    style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                >
                    {i + 1}
                </Box>
            ))}
        </>
    )
}

/** The timer glyph: ticking countdown on a server deadline, else a static value. */
export function Timer({ remaining, fallback = "45", x = 8.55, y = 0.51, size = 40 }: {
    remaining: number | null; fallback?: string; x?: number; y?: number; size?: number
}) {
    const text = remaining !== null ? formatRemaining(remaining) : fallback
    return (
        <Box x={x} y={y} w={0.75} className="text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
            {text}
        </Box>
    )
}

export function QuestionBlock({ question }: { question: PlayerQuestion | null }) {
    return (
        <>
            <Box x={0.59} y={1.4} w={3.56} h={1.04} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                {question?.questionText ?? "Đang chờ MC…"}
            </Box>
            <Box x={4.16} y={1.46} w={4.99} h={2.85} className="overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                {question?.media?.type === "image" ? (
                    <img src={question.media.url} alt="" className="h-full w-full object-contain" />
                ) : (
                    <span className="flex h-full items-center justify-center font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                        {question?.media ? `media: ${question.media.type}` : "hình ảnh câu hỏi"}
                    </span>
                )}
            </Box>
        </>
    )
}

export function VerdictIcon({ verdict }: { verdict?: "CORRECT" | "INCORRECT" | null }) {
    if (verdict === "CORRECT") return <CheckCircle2 className="size-[1.15em] shrink-0 text-emerald-600" aria-label="Đúng" />
    if (verdict === "INCORRECT") return <XCircle className="size-[1.15em] shrink-0 text-red-600" aria-label="Sai" />
    if (verdict === null) return <Hourglass className="size-[1.15em] shrink-0 text-amber-500" aria-label="Chưa chấm" />
    return null
}

/**
 * Contestant cards (x 9.97, w 3.12) — deck internals, compact h 1.24 (S1/5/8)
 * or answer h 1.61 (S2/3/4/6/7). THE me-HIGHLIGHT: this player's own card gets
 * a sky ring (the judging ring is the MC's; this one is identity).
 */
export function Rail({ variant, view, myId, currentQid }: {
    variant: "compact" | "answers"
    view: PlayerView
    myId: string | null
    currentQid?: string | null
}) {
    const ys = variant === "compact" ? [0.39, 1.77, 3.14, 4.55] : [0.39, 2.13, 3.86, 5.61]
    const h = variant === "compact" ? 1.24 : 1.61
    const CW = 3.12
    const at = (x: number, y: number, w: number, hh: number): CSSProperties => ({
        position: "absolute",
        left: `${+((x / CW) * 100).toFixed(3)}%`,
        top: `${+((y / h) * 100).toFixed(3)}%`,
        width: `${+((w / CW) * 100).toFixed(3)}%`,
        height: `${+((hh / h) * 100).toFixed(3)}%`,
    })
    const centered = "flex items-start justify-center text-center leading-tight"

    return (
        <>
            {view.table.map((row, i) => {
                if (i > 3) return null // the deck draws 4 cards; a wider field overflows the canvas
                const mine = myId !== null && row.id === myId
                const myVerdict = currentQid ? view.me.verdicts?.[currentQid] : undefined
                const activeRun = view.oral?.playerId === row.id
                return (
                    <Box
                        key={row.id}
                        x={9.97} y={ys[i]} w={CW} h={h}
                        title={mine ? "Bạn" : undefined}
                        className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border ${
                            mine ? "ring-2 ring-sky-500" : activeRun ? "ring-2 ring-amber-400" : ""
                        }`}
                    >
                        <div
                            style={{ ...at(0.16, 0.09, 1.77, 1.01), fontSize: pt(20) }}
                            className="flex items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                            aria-hidden
                        >
                            {row.displayName.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                        </div>
                        <div style={{ ...at(1.9, 0.03, 1.19, 0.37), fontSize: pt(16) }} className={`${centered} truncate font-display font-medium text-foreground`}>
                            {row.displayName}
                            {mine && <span className="ml-1 rounded bg-sky-500 px-1 text-[0.65em] leading-none text-white">BẠN</span>}
                        </div>
                        <div style={{ ...at(1.9, 0.24, 1.19, 0.6), fontSize: pt(52), ...DECK_PAD }} className={`${centered} font-display font-bold tabular-nums text-foreground`}>
                            {row.points}
                        </div>
                        {variant === "answers" && (
                            <div style={{ ...at(0, 1.13, CW, 0.5), fontSize: pt(12), ...DECK_PAD }} className="flex items-start justify-center gap-1 overflow-hidden text-center font-sans text-muted-foreground">
                                {mine && currentQid ? (
                                    <span className="inline-flex items-center gap-1">
                                        câu này <VerdictIcon verdict={myVerdict ?? null} />
                                    </span>
                                ) : (
                                    <span>—</span>
                                )}
                            </div>
                        )}
                    </Box>
                )
            })}
        </>
    )
}

export function MainCard({ y = 0.39, h = 4.12, children }: { y?: number; h?: number; children?: ReactNode }) {
    return (
        <>
            <Box x={0.45} y={y} w={8.96} h={h} className="rounded-2xl bg-card shadow-md ring-1 ring-border" />
            {children}
        </>
    )
}

/**
 * The player's ActionBar band — THE deck strip's rectangle, holding the input
 * instead of the MC's buttons: text input + Gửi, MC options on the exact button
 * slots, the buzzer, the keyword box, the pick confirm. Muted by default (a
 * display slot, like the strip's countdown cells), primary when actionable.
 */
export function Band({ slide, children }: { slide: BandId; children: ReactNode }) {
    const { x, y, w } = BAND[slide]
    return (
        <Box x={x} y={y} w={w} className="flex min-h-[0.44rem] flex-wrap items-center gap-2" style={{ minHeight: py(0.44) }}>
            {children}
        </Box>
    )
}

/** Status slot beside the band: refusal flash (red) > hint (muted). */
export function Status({ y, error, hint }: { y: number; error?: string | null; hint?: ReactNode }) {
    return (
        <Box x={7.75} y={y} w={1.66} className="flex items-center justify-end text-right leading-tight" style={{ fontSize: pt(10), ...DECK_PAD }}>
            {error ? (
                <span role="alert" className="font-semibold text-destructive">{error}</span>
            ) : (
                <span className="text-muted-foreground">{hint}</span>
            )}
        </Box>
    )
}


export function AnswerBand({ slide, question, answerState, verdict, disabled, busy, error, onSubmit }: {
    slide: BandId
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
            <span className="inline-flex items-center gap-2 font-sans font-semibold" style={{ fontSize: pt(13) }}>
                {state.picked || state.text ? `Đã trả lời: ${state.picked || state.text}` : "Đã trả lời"}
                <VerdictIcon verdict={verdict ?? null} />
            </span>
        )
    }

    const options = question.payload.options ?? []
    const isMc = question.kind === "MC" && options.length > 0

    if (isMc) {
        // MC options land EXACTLY on the deck's strip button slots.
        const xs = STRIP_XS[slide]
        const row = xs.slice(0, Math.max(4, options.length))
        return (
            <>
                {options.map((option, i) => (
                    <Box
                        key={option.id}
                        x={row[i] ?? BAND[slide].x + i * 1.34}
                        y={BAND[slide].y} w={1.21} h={0.44}
                        onClick={disabled || busy ? undefined : () => setDraft({ qid, picked: option.id, text: "" })}
                        title={option.text}
                        className={`flex cursor-pointer items-center justify-center px-1 text-center font-sans font-semibold leading-tight shadow-sm transition ${optionCls(state.picked === option.id)} ${disabled ? "cursor-default opacity-60" : ""}`}
                        style={{ fontSize: pt(10), borderRadius: STRIP_R }}
                    >
                        <span className="truncate">
                            <b>{String.fromCharCode(65 + i)}.</b> {option.text}
                        </span>
                    </Box>
                ))}
                <Box
                    x={(row[3] ?? BAND[slide].x + 3 * 1.34) + 1.34} y={BAND[slide].y} w={1.21} h={0.44}
                    onClick={state.picked && !disabled && !busy ? () => onSubmit({ picked: [state.picked] }) : undefined}
                    className={`flex items-center justify-center rounded-lg font-sans font-semibold uppercase shadow-sm ${submitCls} ${!state.picked || disabled || busy ? "cursor-default opacity-50" : "cursor-pointer"}`}
                    style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                >
                    {busy ? "…" : "Gửi"}
                </Box>
            </>
        )
    }

    // Text answer: one input + Gửi, filling the band.
    const { x, y, w } = BAND[slide]
    return (
        <>
            <Box x={x} y={y} w={w - 1.35} h={0.44}>
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
            </Box>
            <Box
                x={x + w - 1.21} y={y} w={1.21} h={0.44}
                onClick={state.text.trim() && !disabled && !busy ? () => onSubmit({ text: state.text.trim() }) : undefined}
                className={`flex items-center justify-center rounded-lg font-sans font-semibold uppercase shadow-sm ${submitCls} ${!state.text.trim() || disabled || busy ? "cursor-default opacity-50" : "cursor-pointer"}`}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {busy ? "…" : "Gửi"}
            </Box>
        </>
    )
}

/** The keyword box (band-sized): input + Nộp, derived-draft like AnswerBand. */
export function KeywordBox({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => void }) {
    const [draft, setDraft] = useState({ locked: false, text: "" })
    // `locked` flips true on submit: the box confirms locally until the pushed
    // view carries keywordLocked (the server is the truth either way).
    if (draft.locked) {
        return <span className="inline-flex items-center gap-2 font-sans font-semibold text-emerald-600" style={{ fontSize: pt(13) }}>Đã nộp từ khóa — chờ MC chốt</span>
    }
    return (
        <>
            <Box x={BAND[3].x} y={BAND[3].y} w={BAND[3].w - 1.35} h={0.44}>
                <input
                    type="text"
                    value={draft.text}
                    disabled={busy}
                    onChange={(event) => setDraft({ locked: false, text: event.target.value })}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && draft.text.trim() && !busy) {
                            onSubmit(draft.text.trim())
                            setDraft({ locked: true, text: draft.text })
                        }
                    }}
                    placeholder="Từ khóa của bạn — chốt một lần"
                    className={inputCls}
                    style={{ fontSize: pt(13) }}
                    aria-label="Từ khóa của bạn"
                />
            </Box>
            <Box
                x={BAND[3].x + BAND[3].w - 1.21} y={BAND[3].y} w={1.21} h={0.44}
                onClick={draft.text.trim() && !busy ? () => { onSubmit(draft.text.trim()); setDraft({ locked: true, text: draft.text }) } : undefined}
                className={`flex items-center justify-center rounded-lg font-sans font-semibold uppercase shadow-sm ${submitCls} ${!draft.text.trim() || busy ? "cursor-default opacity-50" : "cursor-pointer"}`}
                style={{ fontSize: pt(11), borderRadius: STRIP_R }}
            >
                {busy ? "…" : "Nộp"}
            </Box>
        </>
    )
}

/** A centered message INSIDE the canvas — the deck frame stays, content explains. */
export function Gate({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
    return (
        <div className="flex h-full items-center justify-center p-8">
            <div className="flex max-w-xl flex-col items-center gap-3 rounded-2xl bg-card p-8 text-center shadow-md ring-1 ring-border">
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
    slide: SlideId
    bandSlide: BandId
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
