/**
 * PlayerShell — StageShell in PLAYER mode: the OC3.pptm deck, but the drawn
 * control strip is replaced by the player's own ActionBar band — input box,
 * MC option buttons, buzzer, keyword box, pick-confirm — exactly where the MC's
 * buttons used to sit (ui-structure-plan.md ③, decision: same shell, input
 * replaces controls in the ActionBar region).
 *
 * Transport = docs/live-surface.md § L3: HTTP up, socket down (lib/player-live).
 * The rail keeps the deck's card geometry with a `me`-highlight ring on this
 * player's own card; everything else (badges, squares, timer, board, tiles) is
 * driven by the pushed PlayerView — no static demo data anywhere.
 *
 * Geometry is deck-exact (same math as StageShell / LiveConsole): every Box is
 * the PPT's own inch coordinate on the 13.333×7.5 canvas.
 */
import { useState, type CSSProperties, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { CheckCircle2, Hand, Hourglass, Shield, XCircle, Zap } from "lucide-react"
import { formatRemaining, useCountdown } from "@shared/lib/clock"
import { StageShell } from "@/components/stage/StageShell"
import { Lobby } from "@/components/stage/Lobby"
import {
    refusalOf,
    usePlayerAnswer,
    usePlayerKeyword,
    usePlayerLive,
    usePlayerLobby,
    usePlayerMe,
    useVeDichCommand,
    type AnswerValue,
    type PlayerQuestion,
    type PlayerView,
} from "@/lib/player-live"

// ── geometry: PPT inches → canvas units (the shell's own math) ───────────────
const SLIDE_W = 13.3333
const SLIDE_H = 7.5
const px = (i: number) => `${+((i / SLIDE_W) * 100).toFixed(3)}%`
const py = (i: number) => `${+((i / SLIDE_H) * 100).toFixed(3)}%`
/** deck points (sz="NNNN") → container width units (1in = 72pt). */
const PT_SCALE = 0.75
const pt = (v: number) => `${+(((v * PT_SCALE) / 72 / SLIDE_W) * 100).toFixed(3)}cqw`
/** strip radius: deck roundRect adj 31623 × button height 0.44in */
const STRIP_R = `${+(((0.44 * 0.31623) / SLIDE_W) * 100).toFixed(3)}cqw`
/** PowerPoint's default text insets (406 bodyPr verified across the deck). */
const DECK_PAD: CSSProperties = {
    paddingLeft: "0.75cqw",
    paddingRight: "0.75cqw",
    paddingTop: "0.375cqw",
    paddingBottom: "0.375cqw",
}

const ROUND_LABEL: Record<string, string> = {
    "khoi-dong": "Khởi động",
    "giai-ma": "Giải mã",
    "but-pha": "Bứt phá",
    "ve-dich": "Về đích",
}

// ── the band: same rectangle the deck's strip occupies, per slide ────────────
// (x/y/w from the deck's own button geometry — the input REPLACES the strip.)
const BAND: Record<number, { x: number; y: number; w: number }> = {
    1: { x: 2.25, y: 4.69, w: 5.21 },
    2: { x: 2.31, y: 4.69, w: 5.22 },
    3: { x: 2.31, y: 6.52, w: 5.22 },
    4: { x: 2.37, y: 4.68, w: 5.22 },
    56: { x: 2.9, y: 4.9, w: 3.79 },
    7: { x: 2.38, y: 4.67, w: 5.23 },
    8: { x: 1.66, y: 4.67, w: 6.53 },
}
/** The deck's per-slide button xs — MC options land exactly on these slots. */
const STRIP_XS: Record<number, number[]> = {
    1: [2.25, 3.59, 4.92, 6.25],
    2: [2.31, 3.65, 4.98, 6.32],
    3: [2.31, 3.65, 4.98, 6.32],
    4: [2.37, 3.71, 5.04, 6.38],
    56: [2.9, 4.21, 5.49],
    7: [2.38, 3.72, 5.05, 6.38],
    8: [1.66, 2.99, 4.31, 5.64, 6.98],
}
type BandId = 1 | 2 | 3 | 4 | 56 | 7 | 8

// ── primitives (the shell's deck boxes) ──────────────────────────────────────
function Box({
    x, y, w, h, className = "", style, onClick, title, children,
}: {
    x: number; y: number; w?: number; h?: number
    className?: string; style?: CSSProperties; onClick?: () => void; title?: string; children?: ReactNode
}) {
    return (
        <div
            className={`absolute ${className}`}
            onClick={onClick}
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

function Badges({ round, mode, y = 0.55, size = 32 }: { round: string; mode?: string; y?: number; size?: number }) {
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
function Progress({ total, done, active, onPick }: { total: number; done: number; active: number; onPick?: (i: number) => void }) {
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
function Timer({ remaining, fallback = "45", x = 8.55, y = 0.51, size = 40 }: {
    remaining: number | null; fallback?: string; x?: number; y?: number; size?: number
}) {
    const text = remaining !== null ? formatRemaining(remaining) : fallback
    return (
        <Box x={x} y={y} w={0.75} className="text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
            {text}
        </Box>
    )
}

function QuestionBlock({ question }: { question: PlayerQuestion | null }) {
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

function VerdictIcon({ verdict }: { verdict?: "CORRECT" | "INCORRECT" | null }) {
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
function Rail({ variant, view, myId, currentQid }: {
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

function MainCard({ y = 0.39, h = 4.12, children }: { y?: number; h?: number; children?: ReactNode }) {
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
function Band({ slide, children }: { slide: BandId; children: ReactNode }) {
    const { x, y, w } = BAND[slide]
    return (
        <Box x={x} y={y} w={w} className="flex min-h-[0.44rem] flex-wrap items-center gap-2" style={{ minHeight: py(0.44) }}>
            {children}
        </Box>
    )
}

/** Status slot beside the band: refusal flash (red) > hint (muted). */
function Status({ y, error, hint }: { y: number; error?: string | null; hint?: ReactNode }) {
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

const inputCls =
    "h-full min-h-[1.9em] flex-1 rounded-lg border border-input bg-background px-3 font-sans text-foreground outline-none focus:ring-2 focus:ring-ring disabled:bg-muted"
const submitCls =
    "flex h-full min-h-[1.9em] items-center justify-center rounded-lg bg-primary px-4 font-sans text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
const optionCls = (selected: boolean) =>
    `flex items-center justify-center gap-1 rounded-lg px-2 text-center font-sans font-semibold shadow-sm transition ${
        selected ? "bg-primary text-primary-foreground ring-2 ring-ring" : "bg-muted text-foreground ring-1 ring-border hover:bg-accent"
    }`

/**
 * One typed/MC answer control inside the band. The draft is DERIVED per
 * question (qid in the state = the question the text belongs to), so a new
 * question starts a clean box with no setState-in-effect.
 */
function AnswerBand({ slide, question, answerState, verdict, disabled, busy, error, onSubmit }: {
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

// ── the shell ────────────────────────────────────────────────────────────────

type SlideId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export function PlayerShell({ matchId }: { matchId: string }) {
    // ── hooks first — early returns must not move the hook line ──────────────
    const me = usePlayerMe(true)
    const live = usePlayerLive(matchId, true)
    const answer = usePlayerAnswer(matchId)
    const keywordSubmit = usePlayerKeyword(matchId)
    const cmd = useVeDichCommand(matchId)

    const [view2, setView2] = useState({ qid: "", idx: 0 })   // S2 question selector (derived reset)
    const [pickedCells, setPickedCells] = useState<string[]>([])  // ve-dich board picks

    const v = live.view
    const open = v?.open ?? []
    const remaining = useCountdown(open[0]?.deadlineAt ?? null, live.clock)
    const myId = me.data?.id ?? null

    // Waiting = no view yet (409: match not LIVE) or a round not running.
    // The lobby answers in BOTH cases — ask for it whenever that's true.
    const stageNow = v?.stage
    const waiting =
        live.failureStatus === 409 ||
        !v ||
        stageNow === "pending" ||
        stageNow === "ended" ||
        stageNow === "unknown"
    const lobby = usePlayerLobby(matchId, waiting)

    // ── gates (inside the canvas: the deck frame never flickers away) ────────
    if (live.failureStatus === 401) {
        return (
            <StageShell>
                <Gate title="Chưa vào trận" body="Phiên thí sinh đã hết hạn — nhập lại mã PIN để vào ghế.">
                    <Link to="/join" className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Nhập lại mã PIN</Link>
                </Gate>
            </StageShell>
        )
    }
    if (live.failureStatus === 403) {
        return (
            <StageShell>
                <Gate title="Không có trong trận" body="Ghế này không thuộc về bạn — báo lại với MC.">
                    <Link to="/join" className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Nhập mã khác</Link>
                </Gate>
            </StageShell>
        )
    }
    if (live.failureStatus === 409) {
        // Not LIVE yet — the lobby is the waiting screen (hook keeps polling).
        return (
            <StageShell>
                {lobby.data ? (
                    <Lobby
                        data={lobby.data}
                        meId={myId}
                        hint="Chờ MC mở trận — trang tự cập nhật."
                    />
                ) : (
                    <Gate title="Trận chưa bắt đầu" body="MC chưa mở trận — trang tự cập nhật khi trận sang LIVE.">
                        <button onClick={live.refetch} className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Thử lại</button>
                    </Gate>
                )}
            </StageShell>
        )
    }
    if (!v) {
        return (
            <StageShell>
                <Gate title="Đang tải…" body={live.error ? String((live.error as Error).message) : "Đọc trạng thái vòng thi"}>
                    {live.error ? (
                        <button onClick={live.refetch} className="rounded-lg bg-primary px-4 py-2 font-sans text-sm font-semibold text-primary-foreground">Thử lại</button>
                    ) : null}
                </Gate>
            </StageShell>
        )
    }

    // ── derived facts ────────────────────────────────────────────────────────
    const roundId = v.roundId
    const stage = v.stage
    const started = stage !== "pending" && stage !== "unknown"
    const keyword = v.keyword ?? null
    const flash = refusalOf(answer.error) ?? refusalOf(keywordSubmit.error) ?? refusalOf(cmd.error)
    const nameOf = (id: string) => v.table.find((row) => row.id === id)?.displayName ?? "Thí sinh"

    // slide derivation — the MC's locked mapping, from the PLAYER's view:
    // ve-dich S8/S5 = phase 2, S7/S6 = phase 1; khoi-dong S2 = phase 2.
    let slide: SlideId
    if (roundId === "giai-ma") slide = 3
    else if (roundId === "but-pha") slide = 4
    else if (roundId === "ve-dich") {
        const phase2 = stage === "phase2"
        slide = open.length > 0 ? (phase2 ? 8 : 7) : phase2 ? 5 : 6
    } else slide = stage === "phase2" ? 2 : 1

    const bandSlide: BandId = slide === 5 || slide === 6 ? 56 : slide === 8 ? 8 : slide

    // S2: which of the batch is on screen (derived: drop a qid that closed)
    const s2Idx = Math.min(view2.idx, Math.max(0, open.length - 1))
    const s2Q = slide === 2 && open[s2QIndex(view2.qid, open)] !== undefined
        ? open[s2QIndex(view2.qid, open)]
        : open[s2Idx]
    const answeredSet = new Set(v.me.answered ?? [])

    // ── waiting / unknown rounds → THE LOBBY ───────────────────────────────────
    if (!started || (roundId === "giai-ma" && stage === "ended") ||
        (roundId === "but-pha" && stage === "ended") ||
        (roundId === "ve-dich" && stage === "ended") || stage === "unknown") {
        if (lobby.data) {
            return (
                <StageShell>
                    <Lobby
                        data={lobby.data}
                        meId={myId}
                        hint={
                            stage === "unknown"
                                ? "Vòng này chưa có màn hình thí sinh — hỏi MC."
                                : stage === "ended"
                                  ? "Vòng đã kết thúc — chờ MC chuyển vòng."
                                  : "Chờ MC bắt đầu vòng — trang tự cập nhật."
                        }
                    />
                </StageShell>
            )
        }
        // Lobby still loading: the deck's own waiting card (no flicker of a blank canvas).
        return (
            <StageShell>
                <MainCard>
                    <Badges round={ROUND_LABEL[roundId] ?? roundId} />
                    <Box x={0.59} y={1.6} w={8.0} className="font-sans leading-relaxed text-foreground" style={{ fontSize: pt(16), ...DECK_PAD }}>
                        {stage === "ended"
                            ? "Vòng đã kết thúc — chờ MC chuyển vòng."
                            : stage === "unknown"
                              ? "Vòng này chưa có màn hình thí sinh — hỏi MC."
                              : "Chờ MC bắt đầu vòng — trang tự cập nhật."}
                    </Box>
                    <Box x={0.59} y={2.3} w={8.0} className="font-sans text-muted-foreground" style={{ fontSize: pt(13), ...DECK_PAD }}>
                        Điểm của bạn: <b className="tabular-nums text-foreground">{v.me.points ?? v.me.score ?? 0}</b>
                    </Box>
                </MainCard>
                <Rail variant="compact" view={v} myId={myId} />
            </StageShell>
        )
    }

    // ── per-slide screens ────────────────────────────────────────────────────
    let screen: ReactNode

    if (roundId === "khoi-dong" && slide === 1) {
        // Oral: nobody types — the band carries the run status + budget bar.
        const oral = v.oral
        const mine = v.me.isMyRun === true
        const spent = oral ? Math.min(1, oral.elapsedS / Math.max(1, oral.budgetS)) : 0
        const budgetLeft = oral ? Math.max(0, Math.ceil(oral.budgetS - oral.elapsedS)) : null
        screen = (
            <>
                <MainCard>
                    <Badges round="Khởi động" mode="Lượt cá nhân" />
                    <Progress total={oral?.total ?? 6} done={oral?.index ?? 0} active={oral?.index ?? 0} />
                    <Timer remaining={null} fallback={budgetLeft !== null ? String(budgetLeft) : "45"} />
                    <QuestionBlock question={oral?.question ?? null} />
                </MainCard>
                <Rail variant="compact" view={v} myId={myId} />
                <Band slide={1}>
                    <span
                        className={`flex h-full items-center rounded-lg px-3 font-sans font-semibold ${mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground ring-1 ring-border"}`}
                        style={{ fontSize: pt(12), borderRadius: STRIP_R }}
                    >
                        {mine ? "ĐẾN LƯỢT BẠN — trả lời miệng" : oral ? `Đang thi: ${nameOf(oral.playerId)}` : "MC đang gọi thí sinh…"}
                    </span>
                    {oral && (
                        <span className="flex h-full min-w-[6rem] flex-1 items-center overflow-hidden rounded-lg bg-muted ring-1 ring-border" style={{ borderRadius: STRIP_R }} title={`Ngân sách: ${oral.elapsedS}/${oral.budgetS}s`}>
                            <span className="h-full bg-amber-400/80 transition-all" style={{ width: `${spent * 100}%` }} />
                            <span className="px-2 font-sans tabular-nums text-foreground" style={{ fontSize: pt(11) }}>
                                {oral.budgetS - oral.elapsedS}s
                            </span>
                        </span>
                    )}
                </Band>
                <Status y={5.24} error={flash} hint={oral ? `câu ${oral.index + 1}/${oral.total}` : "mọi thí sinh cùng xem"} />
            </>
        )
    } else if (roundId === "khoi-dong" && slide === 2) {
        // Batch: 6 questions, one shared deadline — squares switch, band types.
        screen = (
            <>
                <MainCard>
                    <Badges round="Khởi động" mode="Lượt chung" />
                    <Progress
                        total={open.length || 6}
                        done={open.filter((q) => answeredSet.has(q.questionId)).length}
                        active={s2Idx}
                        onPick={(i) => open[i] && setView2({ qid: open[i].questionId, idx: i })}
                    />
                    <Timer remaining={remaining} fallback="60s" />
                    <QuestionBlock question={s2Q?.question ?? null} />
                </MainCard>
                <Rail variant="answers" view={v} myId={myId} currentQid={s2Q?.questionId ?? null} />
                <Band slide={2}>
                    {s2Q ? (
                        <AnswerBand
                            slide={2}
                            question={s2Q.question}
                            answerState={answeredSet.has(s2Q.questionId)
                                ? v.me.finalized?.includes(s2Q.questionId) ? "final" : "draft"
                                : "none"}
                            verdict={v.me.verdicts?.[s2Q.questionId]}
                            disabled={open.length === 0}
                            busy={answer.isPending}
                            error={flash}
                            onSubmit={(value) => answer.mutate({ questionId: s2Q.questionId, value })}
                        />
                    ) : (
                        <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Đã hết 60 giây — chờ MC chấm.</span>
                    )}
                </Band>
                <Status y={5.24} error={flash} hint={open.length > 0 ? `còn ${formatRemaining(remaining)} · câu ${s2Idx + 1}/${open.length}` : "chờ MC chấm"} />
            </>
        )
    } else if (roundId === "giai-ma") {
        // Hint window → answer box in the band; otherwise the KEYWORD box.
        const hintWindow = open[0] ?? null
        const locked = v.me.keywordLocked === true
        const eliminated = v.me.eliminated === true
        const codeLength = keyword?.question?.payload.codeLength ?? null
        const tileX = [0.51, 2.83, 5.15, 7.43]
        const tileY = [1.33, 2.79]
        screen = (
            <>
                {codeLength !== null && (
                    <Box x={0.51} y={0.39} w={8.96} h={0.8} className="flex items-center justify-center rounded-2xl bg-card shadow-md ring-1 ring-border">
                        <span className="font-display font-bold uppercase tracking-wide text-foreground" style={{ fontSize: pt(40) }}>
                            Mật mã gồm có {codeLength} chữ cái
                        </span>
                    </Box>
                )}
                {tileY.map((y, row) =>
                    tileX.map((x, col) => {
                        const n = row * 4 + col + 1
                        const openTile = hintWindow !== null
                        return (
                            <Box
                                key={n}
                                x={x} y={y} w={2.03} h={1.32}
                                className={`flex items-center justify-center rounded-2xl font-display font-bold leading-none shadow-md ${
                                    openTile
                                        ? "bg-muted text-muted-foreground ring-1 ring-border"
                                        : "bg-card text-foreground ring-1 ring-border"
                                }`}
                                style={{ fontSize: pt(60) }}
                            >
                                {n}
                            </Box>
                        )
                    }),
                )}
                <MainCard y={4.27} h={2.08}>
                    <Badges round="Giải mã" y={4.38} size={28} />
                    <Timer y={4.38} size={32} remaining={hintWindow ? remaining : null} fallback="15s" />
                    <Box x={0.65} y={4.98} w={8.57} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                        {hintWindow
                            ? hintWindow.question?.questionText ?? ""
                            : keyword?.question?.questionText ?? "Chờ MC mở gợi ý"}
                    </Box>
                </MainCard>
                <Rail variant="answers" view={v} myId={myId} currentQid={hintWindow?.questionId ?? keyword?.questionId ?? null} />
                <Band slide={3}>
                    {hintWindow ? (
                        <AnswerBand
                            slide={3}
                            question={hintWindow.question}
                            answerState={v.me.answerState}
                            verdict={v.me.verdicts?.[hintWindow.questionId]}
                            busy={answer.isPending}
                            error={flash}
                            onSubmit={(value) => answer.mutate({ questionId: hintWindow.questionId, value })}
                        />
                    ) : eliminated ? (
                        <span className="flex h-full items-center rounded-lg bg-red-50 px-3 font-sans font-semibold text-red-600 ring-1 ring-red-200" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                            Bạn không giải được từ khóa — bị loại vòng này
                        </span>
                    ) : locked ? (
                        <span className="inline-flex items-center gap-2 font-sans font-semibold text-emerald-600" style={{ fontSize: pt(13) }}>
                            Đã khóa từ khóa <VerdictIcon verdict={v.me.verdicts?.[keyword?.questionId ?? ""]} />
                        </span>
                    ) : keyword ? (
                        <KeywordBox
                            busy={keywordSubmit.isPending}
                            onSubmit={(text) => keywordSubmit.mutate({ questionId: keyword.questionId, value: { text } })}
                        />
                    ) : (
                        <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ MC mở gợi ý.</span>
                    )}
                </Band>
                <Status y={7.06} error={flash} hint={hintWindow ? "cửa sổ gợi ý đang mở" : `đã mở ${v.me.hintsRevealed ?? 0} gợi ý`} />
            </>
        )
    } else if (roundId === "but-pha") {
        const openQ = open[0] ?? null
        const pos = openQ?.question?.position ?? null
        const done = stage === "ended" ? 4 : pos !== null ? pos : 0
        screen = (
            <>
                <MainCard>
                    <Badges round="Bứt phá" />
                    <Progress total={4} done={done} active={pos ?? done} />
                    <Timer remaining={openQ ? remaining : null} fallback="30s" />
                    <QuestionBlock question={openQ?.question ?? null} />
                </MainCard>
                <Rail variant="answers" view={v} myId={myId} currentQid={openQ?.questionId ?? null} />
                <Band slide={4}>
                    {openQ ? (
                        <AnswerBand
                            slide={4}
                            question={openQ.question}
                            answerState={v.me.answerState}
                            verdict={v.me.verdicts?.[openQ.questionId]}
                            busy={answer.isPending}
                            error={flash}
                            onSubmit={(value) => answer.mutate({ questionId: openQ.questionId, value })}
                        />
                    ) : (
                        <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>Chờ MC mở câu tiếp theo…</span>
                    )}
                </Band>
                <Status y={5.23} error={flash} hint={openQ ? `còn ${formatRemaining(remaining)}` : "chờ MC"} />
            </>
        )
    } else if (roundId === "ve-dich" && open.length === 0) {
        // Board (S6 = phase 1 pick-one · S5 = phase 2 pick-three): cells ARE the picker.
        const phase2 = stage === "phase2"
        const COL_X = [0.54, 2.03, 3.52, 5.0, 6.49, 7.97]
        const ROW_Y = [1.57, 2.31, 3.05, 3.78]
        const board = v.board ?? []
        const domains = [...new Set(board.map((cell) => cell.domain))]
        const values = [...new Set(board.map((cell) => cell.value))].sort((a, b) => a - b)
        const pending = new Set(v.me.pendingPicks ?? [])
        const picking = v.me.isMyTurn === true && pending.size === 0
        const need = phase2 ? 3 : 1

        const toggle = (id: string) => {
            if (!picking) return
            setPickedCells((current) => {
                if (current.includes(id)) return current.filter((x) => x !== id)
                if (!phase2) return [id]
                return current.length >= 3 ? current : [...current, id]
            })
        }
        const confirm = () => {
            if (phase2 && pickedCells.length === 3) cmd.mutate({ type: "pickBatch", questionIds: pickedCells })
            if (!phase2 && pickedCells.length === 1) cmd.mutate({ type: "pick", questionId: pickedCells[0] })
        }

        screen = (
            <>
                <MainCard h={4.24}>
                    <Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} />
                    {board.map((cell) => {
                        const ci = domains.indexOf(cell.domain)
                        const ri = values.indexOf(cell.value)
                        if (ci < 0 || ci > 5 || ri < 0 || ri > 3) return null
                        const chosen = pickedCells.includes(cell.questionId)
                        const actionable = picking && cell.where === "free"
                        return (
                            <Box
                                key={cell.questionId}
                                x={COL_X[ci]} y={ROW_Y[ri]} w={1.33} h={0.59}
                                onClick={actionable ? () => toggle(cell.questionId) : undefined}
                                title={cell.where === "free" ? (picking ? "Chọn câu này" : "chưa tới lượt bạn") : cell.where === "pending" ? "đã có thí sinh chọn" : "đang mở"}
                                className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 transition ${
                                    cell.where === "open"
                                        ? "bg-primary text-primary-foreground ring-primary"
                                        : cell.where === "pending"
                                          ? "bg-sky-50 ring-2 ring-sky-500 text-sky-800"
                                          : chosen
                                            ? "bg-sky-50 ring-2 ring-sky-500 text-foreground"
                                            : actionable
                                              ? "bg-card ring-border cursor-pointer hover:bg-accent"
                                              : "bg-card text-muted-foreground/70 ring-border"
                                }`}
                                style={DECK_PAD}
                            >
                                <span className="truncate text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{cell.domain}</span>
                                <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                            </Box>
                        )
                    })}
                </MainCard>
                <Rail variant={phase2 ? "compact" : "answers"} view={v} myId={myId} />
                <Band slide={56}>
                    <span className="flex h-full items-center rounded-lg bg-muted px-3 font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                        {!picking
                            ? pending.size > 0
                              ? `Đã chốt ${pending.size} câu — chờ MC mở`
                              : v.me.isMyTurn
                                ? "Đến lượt bạn!"
                                : "Đến lượt thí sinh khác"
                            : pickedCells.length > 0
                              ? `Đã chọn ${pickedCells.length}/${need}`
                              : phase2 ? "Chọn 3 câu trên bảng" : "Chọn một câu trên bảng"}
                    </span>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={cmd.isPending || pickedCells.length !== need}
                        className="flex h-full min-h-[1.9em] items-center rounded-lg bg-primary px-4 font-sans text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                        style={{ borderRadius: STRIP_R }}
                    >
                        {cmd.isPending ? "Đang chốt…" : phase2 ? `Chốt ${need} câu` : "Chọn câu này"}
                    </button>
                </Band>
                <Status y={5.44} error={flash} hint={picking ? "bấm Ô để chọn" : undefined} />
            </>
        )
    } else {
        // Question (S7 = phase 1 typed · S8 = phase 2 oral + buzz + powers).
        const phase2 = stage === "phase2"
        const openQ = open[0] ?? null
        const qid = openQ?.questionId ?? ""
        const stripCells = (v.board ?? []).filter((cell) => cell.where !== "free").slice(0, phase2 ? 3 : 4)
        const stripX = phase2 ? [4.2, 5.66, 7.14] : [2.7, 4.2, 5.66, 7.14]
        screen = (
            <>
                <MainCard>
                    <Badges round="Về đích" mode={phase2 ? "Lượt cá nhân" : "Lượt chung"} />
                    {stripCells.map((cell, i) => (
                        <Box key={cell.questionId} x={stripX[i]} y={0.65} w={1.33} h={0.59}
                            className={`flex flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${cell.where === "open" ? "bg-primary text-primary-foreground ring-primary" : "bg-muted ring-border"}`}
                            style={DECK_PAD}
                        >
                            <span className="truncate px-1 text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{cell.domain}</span>
                            <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{cell.value}</b>
                        </Box>
                    ))}
                    <Timer remaining={openQ ? remaining : null} fallback="—" />
                    <QuestionBlock question={openQ?.question ?? null} />
                </MainCard>
                <Rail variant={phase2 ? "compact" : "answers"} view={v} myId={myId} currentQid={qid || null} />
                <Band slide={bandSlide}>
                    {/* powers first: declaring is public and one-shot */}
                    {v.me.canDeclarePower && (
                        <>
                            <button
                                type="button"
                                onClick={() => cmd.mutate({ type: "power", power: "HOPE" })}
                                disabled={cmd.isPending}
                                className="flex h-full min-h-[1.9em] items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 font-sans text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                                style={{ borderRadius: STRIP_R }}
                            >
                                <Zap className="size-3.5" aria-hidden /> Hy vọng
                            </button>
                            <button
                                type="button"
                                onClick={() => cmd.mutate({ type: "power", power: "SHIELD" })}
                                disabled={cmd.isPending}
                                className="flex h-full min-h-[1.9em] items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 font-sans text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
                                style={{ borderRadius: STRIP_R }}
                            >
                                <Shield className="size-3.5" aria-hidden /> Khiên
                            </button>
                        </>
                    )}
                    {v.me.canBuzz && openQ ? (
                        <button
                            type="button"
                            onClick={() => cmd.mutate({ type: "buzz", questionId: openQ.questionId })}
                            disabled={cmd.isPending}
                            className="flex h-full min-h-[1.9em] items-center gap-2 rounded-lg bg-destructive px-5 font-sans text-base font-bold uppercase text-destructive-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                            style={{ borderRadius: STRIP_R }}
                            title="Bấm chuông"
                        >
                            <Hand className="size-4" aria-hidden /> Bấm chuông
                        </button>
                    ) : phase2 && v.me.canAnswer && openQ ? (
                        <AnswerBand
                            slide={bandSlide}
                            question={openQ.question}
                            answerState={v.me.answerState}
                            verdict={v.me.verdicts?.[qid]}
                            busy={answer.isPending}
                            error={flash}
                            onSubmit={(value) => answer.mutate({ questionId: qid, value })}
                        />
                    ) : !phase2 && openQ ? (
                        <AnswerBand
                            slide={7}
                            question={openQ.question}
                            answerState={v.me.answerState}
                            verdict={v.me.verdicts?.[qid]}
                            busy={answer.isPending}
                            error={flash}
                            onSubmit={(value) => answer.mutate({ questionId: qid, value })}
                        />
                    ) : (
                        <span className="flex h-full items-center rounded-lg bg-muted px-3 font-sans font-semibold text-foreground ring-1 ring-border" style={{ fontSize: pt(12), borderRadius: STRIP_R }}>
                            {!openQ
                                ? "Chờ MC mở câu hỏi"
                                : v.me.isAnswerer
                                  ? "Bạn trả lời miệng trước MC"
                                  : v.me.buzzer
                                    ? `Đập chuông trước: ${nameOf(v.me.buzzer)}`
                                    : v.me.power
                                      ? `${v.me.power === "HOPE" ? "Bùa hy vọng" : "Bùa bảo hộ"} đã công bố`
                                      : "Theo dõi thí sinh trả lời"}
                        </span>
                    )}
                </Band>
                <Status
                    y={5.22}
                    error={flash}
                    hint={
                        openQ && (phase2 || v.me.canAnswer)
                            ? remaining !== null
                                ? `còn ${formatRemaining(remaining)}`
                                : undefined
                            : undefined
                    }
                />
            </>
        )
    }

    return <StageShell>{screen}</StageShell>
}

/** The keyword box (band-sized): input + Nộp, derived-draft like AnswerBand. */
function KeywordBox({ busy, onSubmit }: { busy: boolean; onSubmit: (text: string) => void }) {
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
function Gate({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
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

/** S2 selector: the remembered qid if it is still open, else the clamped index. */
function s2QIndex(qid: string, open: PlayerView["open"]): number {
    const found = open.findIndex((entry) => entry.questionId === qid)
    return found >= 0 ? found : -1
}

export default PlayerShell
