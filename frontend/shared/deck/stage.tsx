import type { ReactNode } from "react"
import { CheckCircle2, Hourglass, XCircle } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { DECK_PAD, STRIP_R, pt, toClock } from "./geometry"

// ── the flow stage ───────────────────────────────────────────────────────────
// The 16:9 container (StageShell) + flex/grid regions — NO absolute deck
// coordinates anywhere. Sizes stay proportional through cqw (1cqw = 1% of the
// stage width), so every region scales with the projection.

/**
 * The stage frame: a flow column (card · action strip · status) beside the
 * rail column. Screens compose the column; the rail slots on the right.
 */
export function StageLayout({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
    return (
        <div className="absolute inset-0 flex gap-[4cqw] p-[3cqw] pt-[2.9cqw]">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[1.2cqw]">{children}</div>
            {rail && <aside className="flex w-[23.4cqw] shrink-0 flex-col gap-[1cqw]">{rail}</aside>}
        </div>
    )
}

/** THE content card — fills the column, everything inside flows top-down. */
export function MainCard({ className = "", children }: { className?: string; children?: ReactNode }) {
    return (
        <section className={`flex min-h-0 flex-1 flex-col gap-[1.2cqw] rounded-2xl bg-card p-[1.6cqw] shadow-md ring-1 ring-border ${className}`}>
            {children}
        </section>
    )
}

/** The card's top line: badges left, optional middle (board chips), clock right. */
export function CardHeader({ left, mid, right }: { left?: ReactNode; mid?: ReactNode; right?: ReactNode }) {
    return (
        <div className="flex shrink-0 items-start justify-between gap-[1.5cqw]">
            {left}
            {mid && <div className="flex min-w-0 flex-1 items-start justify-center gap-[1.1cqw]">{mid}</div>}
            {right && <div className="flex shrink-0 items-start gap-[1.6cqw]">{right}</div>}
        </div>
    )
}

/** Round name (clickable → the rounds navigator) + the mode line under it. */
export function Badges({ round, mode, size = 32, onRoundClick }: {
    round: string; mode?: string; size?: number; onRoundClick?: () => void
}) {
    const label = (
        <span className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
            {round}
        </span>
    )
    return (
        <div className="flex shrink-0 flex-col items-start gap-[0.5cqw]">
            {onRoundClick ? (
                <button type="button" onClick={onRoundClick} title="Chọn vòng" className="cursor-pointer transition hover:opacity-70">
                    {label}
                </button>
            ) : (
                label
            )}
            {mode && (
                <span className="font-display font-medium leading-none text-muted-foreground" style={{ fontSize: pt(16), ...DECK_PAD }}>
                    {mode}
                </span>
            )}
        </div>
    )
}

/** Question index squares: done ▸ active ▸ pending — a row, count-driven. */
export function Progress({ total, done, active, onPick }: { total: number; done: number; active: number; onPick?: (i: number) => void }) {
    return (
        <div className="flex shrink-0 items-center gap-[0.98cqw]">
            {Array.from({ length: total }, (_, i) => {
                const className = `flex items-center justify-center font-display font-bold leading-none ${
                    i < done
                        ? "bg-primary text-primary-foreground"
                        : i === active
                          ? "bg-card text-foreground ring-2 ring-primary"
                          : "bg-card text-muted-foreground ring-1 ring-border"
                } ${onPick ? "cursor-pointer hover:ring-sky-500" : ""}`
                const style = { width: "1.95cqw", height: "1.95cqw", fontSize: pt(12), borderRadius: STRIP_R }
                return onPick ? (
                    <button key={i} type="button" onClick={() => onPick(i)} className={className} style={style}>{i + 1}</button>
                ) : (
                    <span key={i} className={className} style={style}>{i + 1}</span>
                )
            })}
        </div>
    )
}

/** THE clock — top right of the card, the only one. Seconds only (m:ss collapses). */
export function Timer({ remaining, fallback = "45", size = 40 }: {
    remaining: number | null; fallback?: string; size?: number
}) {
    const text = toClock(remaining !== null ? formatRemaining(remaining) : fallback)
    return (
        <span className="shrink-0 text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size) }}>
            {text}
        </span>
    )
}

/**
 * The question: fixed text column beside the media well. MC passes a string
 * (placeholder well); the player passes the question object's media and gets
 * the actual image.
 */
export function QuestionBlock({ question, media, mediaHint = "hình ảnh câu hỏi" }: {
    question: string | null
    media?: { url: string; type: "image" | "audio" | "video" } | null
    mediaHint?: string
}) {
    return (
        <div className="flex min-h-0 flex-1 gap-[1.4cqw]">
            <p className="w-[26.7cqw] shrink-0 font-sans font-medium leading-snug text-foreground" style={{ fontSize: pt(14), ...DECK_PAD }}>
                {question ?? "Đang chờ MC…"}
            </p>
            <div className="flex min-w-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                {media?.type === "image" ? (
                    <img src={media.url} alt="" className="h-full w-full object-contain" />
                ) : (
                    <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                        {media ? `media: ${media.type}` : mediaHint}
                    </span>
                )}
            </div>
        </div>
    )
}

export function VerdictIcon({ verdict }: { verdict: "CORRECT" | "INCORRECT" | null | undefined }) {
    if (verdict === "CORRECT") return <CheckCircle2 className="size-[1.15em] shrink-0 text-emerald-600" aria-label="Đúng" />
    if (verdict === "INCORRECT") return <XCircle className="size-[1.15em] shrink-0 text-red-600" aria-label="Sai" />
    return <Hourglass className="size-[1.15em] shrink-0 text-amber-500" aria-label="Chưa chấm" />
}

/** Refusal flash (red) > contextual hint (muted) — right-aligned under the strip. */
export function Status({ error, hint }: { error?: string | null; hint?: ReactNode }) {
    return (
        <div className="flex shrink-0 items-center justify-end pr-[1cqw] text-right leading-tight" style={{ fontSize: pt(10), ...DECK_PAD }}>
            {error ? (
                <span role="alert" className="font-semibold text-destructive">{error}</span>
            ) : (
                <span className="text-muted-foreground">{hint}</span>
            )}
        </div>
    )
}

// ── the action strip (MC) ────────────────────────────────────────────────────

/**
 * Về đích's used-question chips above the open question — a flow row of
 * fixed-size chips, any count (phase 1 shows up to 4, phase 2 up to 3).
 */
export function VeDichStripCells({ cells, phase2 }: {
    cells: Array<{ questionId: string; domain: string; value: number; where: string }>
    phase2: boolean
}) {
    return (
        <>
            {cells.slice(0, phase2 ? 3 : 4).map((c) => (
                <span
                    key={c.questionId}
                    className={`flex h-[4.43cqw] w-[10cqw] shrink-0 flex-col items-center justify-center rounded-lg shadow-sm ring-1 ${c.where === "open" ? "bg-primary text-primary-foreground ring-primary" : "bg-muted ring-border"}`}
                    style={DECK_PAD}
                >
                    <span className="truncate px-[0.3cqw] text-center font-display leading-tight" style={{ fontSize: pt(12) }}>{c.domain}</span>
                    <b className="font-display leading-none" style={{ fontSize: pt(20) }}>{c.value}</b>
                </span>
            ))}
        </>
    )
}

export type StripItem = { label: string; content?: ReactNode; onClick?: () => void; title?: string; muted?: boolean; empty?: boolean }

const STRIP_BTN =
    "flex h-[3.3cqw] w-[9.08cqw] shrink-0 items-center justify-center px-[0.5cqw] text-center font-sans text-[inherit] font-semibold uppercase leading-tight tracking-wide shadow-sm"

/**
 * The MC's button strip — a flow row: buttons land left to right, any count.
 * Items without onClick render as a (non-button) display slot, as in the deck.
 */
export function Strip({ items }: { items: StripItem[] }) {
    return (
        <div className="flex shrink-0 flex-wrap items-center gap-[1cqw]">
            {items.map((item) =>
                item.empty ? null : item.onClick ? (
                    <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        title={item.title}
                        className={`${STRIP_BTN} cursor-pointer bg-primary text-primary-foreground transition hover:brightness-110`}
                        style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                    >
                        {item.content ?? item.label}
                    </button>
                ) : (
                    <span
                        key={item.label}
                        title={item.title}
                        className={`${STRIP_BTN} cursor-default bg-muted text-muted-foreground ring-1 ring-border ${item.muted ? "" : "tabular-nums"}`}
                        style={{ fontSize: pt(11), borderRadius: STRIP_R }}
                    >
                        {item.content ?? item.label}
                    </span>
                )
            )}
        </div>
    )
}

// ── the player's ActionBar band ──────────────────────────────────────────────

/** The player's action row — input, options, buzzer, keyword box, pick confirm. */
export function Band({ children }: { children: ReactNode }) {
    return (
        <div className="flex min-h-[3.3cqw] shrink-0 flex-wrap items-center gap-[1cqw]">
            {children}
        </div>
    )
}
