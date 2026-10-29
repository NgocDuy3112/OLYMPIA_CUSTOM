import { type CSSProperties, type ReactNode } from "react"
import { CheckCircle2, Hourglass, XCircle } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { DECK_PAD, STRIP_R, TOP_SHIFT, at, px, py, pt, toClock } from "@shared/deck/geometry"
import {
    type ConsoleQuestion,
    type LiveResponse,
    type GiaiMaMc,
    type QuestionAnswerRow,
    type VeDichMc,
} from "@/lib/live"



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
            title={title}
            style={{
                left: px(x), top: py(y - TOP_SHIFT),
                ...(w !== undefined ? { width: px(w) } : {}),
                ...(h !== undefined ? { height: py(h) } : {}),
                ...style,
            }}
        >
            {children}
        </div>
    )
}

// ── small pieces ─────────────────────────────────────────────────────────────

export function Badges({ round, mode, y = 0.55, size = 32, onRoundClick }: {
    round: string; mode?: string; y?: number; size?: number; onRoundClick?: () => void
}) {
    return (
        <>
            <Box
                x={0.59} y={y}
                onClick={onRoundClick}
                title={onRoundClick ? "Chọn vòng" : undefined}
                className={`font-display font-bold uppercase leading-none text-foreground ${onRoundClick ? "cursor-pointer hover:opacity-70" : ""}`}
                style={{ fontSize: pt(size), ...DECK_PAD }}
            >
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

/** Question index squares (0.26, right-aligned to x 8.62): done ▸ active ▸ pending. */
export function Progress({ total, done, active, onPick }: { total: number; done: number; active: number; onPick?: (i: number) => void }) {
    const startX = 8.46 - (total * 0.26 + (total - 1) * 0.13)
    return (
        <>
            {Array.from({ length: total }, (_, i) => (
                <Box
                    key={i}
                    x={startX + i * 0.39} y={0.78} w={0.26} h={0.26}
                    onClick={onPick ? () => onPick(i) : undefined}
                    className={`flex items-center justify-center font-display font-bold leading-none ${i < done
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

/** The timer glyph: ticking countdown when a server deadline exists, else the deck's static 45. THE clock — top right, the only one. */
export function Timer({ remaining, fallback = "45", x = 8.55, y = 0.51, size = 40 }: {
    remaining: number | null; fallback?: string; x?: number; y?: number; size?: number
}) {
    const text = toClock(remaining !== null ? formatRemaining(remaining) : fallback)
    return (
        <Box x={x} y={y} w={0.75} className="text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
            {text}
        </Box>
    )
}

export type StripItem = { label: string; content?: ReactNode; onClick?: () => void; title?: string; muted?: boolean; empty?: boolean }

/**
 * The deck's button strip — exact per-slide positions. Items without onClick render
 * as the countdown/display slot (still drawn, as in the deck).
 */
export function Strip({ slide, items }: { slide: 1 | 2 | 3 | 4 | 56 | 7 | 8; items: StripItem[] }) {
    const spec: Record<number, { y: number; xs: number[] }> = {
        1: { y: 4.69, xs: [2.25, 3.59, 4.92, 6.25] },
        2: { y: 4.69, xs: [2.31, 3.65, 4.98, 6.32] },
        3: { y: 6.52, xs: [2.31, 3.65, 4.98, 6.32] },
        4: { y: 4.68, xs: [2.37, 3.71, 5.04, 6.38] },
        56: { y: 4.9, xs: [2.9, 4.21, 5.49] },
        7: { y: 4.67, xs: [2.38, 3.72, 5.05, 6.38] },
        8: { y: 4.67, xs: [1.66, 2.99, 4.31, 5.64, 6.98] },
    }
    const { y, xs } = spec[slide]
    return (
        <>
            {items.map((item, i) =>
                item.empty ? null : (
                <Box
                    key={item.label}
                    x={xs[i]} y={y} w={1.21} h={0.44}
                    onClick={item.onClick}
                    title={item.title}
                    className={`flex items-center justify-center font-sans font-semibold uppercase tracking-wide shadow-sm ${item.onClick
                            ? "bg-primary text-primary-foreground transition hover:brightness-110"
                            : `bg-muted text-muted-foreground ring-1 ring-border ${item.muted ? "" : "tabular-nums"}`
                        } ${item.onClick ? "" : "cursor-default"}`}
                    style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                >
                    {item.content ?? item.label}
                </Box>
                )
            )}
        </>
    )
}

/** Status slot beside the strip: refusal flash (red) > contextual hint (muted). */
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

export function VerdictIcon({ verdict }: { verdict: "CORRECT" | "INCORRECT" | null | undefined }) {
    if (verdict === "CORRECT") return <CheckCircle2 className="size-[1.15em] shrink-0 text-emerald-600" aria-label="Đúng" />
    if (verdict === "INCORRECT") return <XCircle className="size-[1.15em] shrink-0 text-red-600" aria-label="Sai" />
    return <Hourglass className="size-[1.15em] shrink-0 text-amber-500" aria-label="Chưa chấm" />
}

// what one rail card shows
export interface CardData {
    id: string
    name: string
    points: number
    answer?: string        // answer-variant bottom line
    value?: string         // answer-variant value row
    verdict?: "CORRECT" | "INCORRECT" | null
    badge?: { text: string; tone: "primary" | "amber" | "emerald" }  // keyword / power pill
    ring?: "selected" | "active"
    dimmed?: boolean       // giai-ma eliminated
    /** has a live player socket right now (the hub's connected list) */
    connected?: boolean
}


export function Rail({ variant, cards, onSelect }: { variant: "compact" | "answers"; cards: CardData[]; onSelect?: (id: string) => void }) {
    const ys = variant === "compact" ? [0.39, 1.77, 3.14, 4.55] : [0.39, 2.13, 3.86, 5.61]
    const h = variant === "compact" ? 1.24 : 1.61
    const CW = 3.12
    const centered = "flex items-start justify-center text-center leading-tight"
    const isAnswers = variant === "answers"
    const nameY = isAnswers ? 0.08 : 0.06
    const scoreY = isAnswers ? 0.32 : 0.30
    const scoreH = isAnswers ? 0.70 : 0.56
    const scoreFont = isAnswers ? 64 : 52
    const answerY = 1.10
    const bottomY = 1.33
    const badgePill = (tone: "primary" | "amber" | "emerald") =>
        `flex items-center justify-center rounded-full px-1 font-sans font-semibold ${tone === "primary"
            ? "bg-primary text-primary-foreground"
            : tone === "amber"
                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-300"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300"
        }`

    return (
        <>
            {cards.map((c, i) => {
                const place = at(CW, h)
                return (
                    <Box
                        key={c.id}
                        x={9.97} y={ys[i]} w={CW} h={h}
                        onClick={onSelect ? () => onSelect(c.id) : undefined}
                        className={`overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition ${onSelect ? "cursor-pointer hover:ring-sky-400" : ""
                            } ${c.ring === "selected" ? "ring-2 ring-primary" : c.ring === "active" ? "ring-2 ring-amber-400" : ""} ${c.dimmed ? "opacity-60" : ""
                            }`}
                    >
                        <div
                            style={{ ...place(0.16, 0.09, 1.77, 1.01), fontSize: pt(20) }}
                            className="flex items-center justify-center rounded-lg bg-muted font-display font-bold text-muted-foreground"
                            aria-hidden
                        >
                            {c.name.replace(/[^A-Za-zÀ-ỹ0-9]/g, "").slice(0, 2).toUpperCase() || "??"}
                        </div>
                        {/* connected dot — follows the player's live socket (hub state).
                            MC's read: green = at a device, gray = gone/idle. */}
                        <div
                            style={{ ...place(1.68, 0.12, 0.16, 0.16) }}
                            className={`rounded-full ring-2 ring-card ${c.connected
                                    ? "bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.25)]"
                                    : "bg-muted-foreground/40"
                                }`}
                        />
                        <div style={{ ...place(1.9, nameY, 1.19, 0.30), fontSize: pt(16) }} className={`${centered} truncate font-display font-medium text-foreground`}>
                            {c.name}
                        </div>
                        <div style={{ ...place(1.9, scoreY, 1.19, scoreH), fontSize: pt(scoreFont), ...DECK_PAD }} className={`${centered} font-display font-bold tabular-nums text-foreground`}>
                            {c.points}
                        </div>
                        {isAnswers && (
                            <div style={{ ...place(0, answerY, CW, 0.24), fontSize: pt(12), ...DECK_PAD }} title={c.answer} className="flex items-start justify-center overflow-hidden text-center font-sans leading-snug text-muted-foreground">
                                <span className="truncate">{c.answer ?? "—"}</span>
                            </div>
                        )}
                        {/* the bottom row: the badge, or the player state —
                            value + verdict (the “timer” row) pinned card-bottom. */}
                        {c.badge && !isAnswers ? (
                            <div
                                style={{ ...place(2.05, 0.88, 0.96, 0.21), fontSize: pt(10) }}
                                className={badgePill(c.badge.tone)}
                            >
                                {c.badge.text}
                            </div>
                        ) : isAnswers ? (
                            <div style={{ ...place(0, bottomY, CW, 0.25) }} className="flex items-center justify-center gap-1">
                                {c.badge ? (
                                    <span style={{ fontSize: pt(10) }} className={badgePill(c.badge.tone)}>
                                        {c.badge.text}
                                    </span>
                                ) : (
                                    <>
                                        <span style={{ fontSize: pt(14) }} className="truncate font-sans font-semibold tabular-nums text-foreground">
                                            {c.value ?? "—"}
                                        </span>
                                        {c.verdict !== undefined && <VerdictIcon verdict={c.verdict} />}
                                    </>
                                )}
                            </div>
                        ) : null}
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

export function QuestionBlock({ question, mediaHint = "hình ảnh câu hỏi" }: { question: string; mediaHint?: string }) {
    return (
        <>
            <Box x={0.59} y={1.4} w={3.56} h={1.04} className="font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                {question}
            </Box>
            <Box x={4.16} y={1.46} w={4.99} h={2.85} className="flex items-center justify-center rounded-2xl bg-muted ring-1 ring-border">
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>{mediaHint}</span>
            </Box>
        </>
    )
}

// ── the screens' contract ────────────────────────────────────────────────────

export type SlideId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

/**
 * Everything a round screen may render with — built ONCE by the orchestrator
 * (live-console), which owns every hook, derived fact and action. Screens are
 * PURE: no hooks, no fetches, no mutations of their own.
 */
export interface DeckCtx {
    /** The polled live read: projection carries stage/open/oral/board/table. */
    v: LiveResponse
    slide: SlideId
    roundEnded: boolean
    started: boolean
    remaining: number | null
    questions: ConsoleQuestion[]
    rows: QuestionAnswerRow[]
    baseCards: CardData[]
    /** giai-ma facts (null outside the round). */
    mcGiaiMa: GiaiMaMc | null
    /** ve-dich facts (null outside the round). */
    mcVeDich: VeDichMc | null
    /** but-pha's question cursor mirror (orchestrator state, reset per round). */
    bpDone: number
    /** the question the ledger is reading (khoi-dong S2 / but-pha S4). */
    judgingId: string | null
    /** verdict target = clicked card, else the first answering player. */
    target: string | null
    setSelectedQ: (questionId: string | null) => void
    setSelectedPlayer: (userId: string) => void
    /** stage an override verdict for the selected card (committed by Kết thúc). */
    setVerdict: (correct: boolean) => void
    /** version-guarded action senders. */
    send: (action: Record<string, unknown>) => void
    /** turn-based (ve-dich): finish the current TURN — the open question, verdicts first. */
    hetLuot: () => void
    /** end the whole ROUND (turn-based: the turn itself is hetLuot's job). */
    ketThuc: () => void
    byId: (id: string) => ConsoleQuestion | null
    verdictOf: (questionId: string, userId: string) => "CORRECT" | "INCORRECT" | null
    /** the MC's stopwatch (khoi-dong S1) — `watchMs` comes from the interval. */
    watchRunning: boolean
    watchMs: number
    toggleWatch: () => void
    /** refusal flash for the Status slots. */
    flash: string | null
    /** the round badge → the rounds navigator. */
    openRounds: () => void
}
