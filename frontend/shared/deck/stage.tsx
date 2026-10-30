import { useState, type ReactNode } from "react"
import { CheckCircle2, Hourglass, XCircle } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { DECK_PAD, STRIP_R, pt, toClock } from "./geometry"


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
        <section className={`flex min-h-0 flex-1 flex-col gap-[1.2cqw] overflow-hidden rounded-2xl bg-card p-[1.6cqw] shadow-md ring-1 ring-border ${className}`}>
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
                const className = `flex items-center justify-center font-display font-bold leading-none ${i < done
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
/**
 * The question: the TEXT takes the whole card when there is no media (no empty
 * gray well for nothing); with media, the well hugs the image's natural aspect
 * (horizontal images span the row, vertical ones stay narrow instead of
 * pillarboxing), is always aligned to the RIGHT of the card with breathing
 * room (right padding only when media exists), and a broken URL falls back to
 * the placeholder rather than a torn icon.
 */
export function QuestionBlock({ question, media, mediaHint = "hình ảnh câu hỏi" }: {
    question: string | null
    media?: { url: string; type: string } | null
    mediaHint?: string
}) {
    return (
        <div className={`flex min-h-0 flex-1 items-stretch gap-[1.4cqw] ${media ? "pr-[1.2cqw]" : ""}`}>
            <p
                className={`min-w-0 font-sans font-medium leading-snug text-foreground ${media ? "w-[26.7cqw] shrink-0" : "flex-1"}`}
                style={{ fontSize: pt(14), ...DECK_PAD }}
            >
                {question ?? "Đang chờ MC…"}
            </p>
            {media && <MediaWell media={media} mediaHint={mediaHint} />}
        </div>
    )
}

function MediaWell({ media, mediaHint }: { media: { url: string; type: string }; mediaHint: string }) {
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
    const [broken, setBroken] = useState(false)

    // Audio/video (or a broken link): a modest labeled well — the deck never
    // plays media inline; the show surface does.
    if (media.type !== "image" || broken) {
        return (
            <div className="ml-auto flex h-full w-[37.4cqw] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
                <span className="font-sans text-muted-foreground" style={{ fontSize: pt(12) }}>
                    {broken ? mediaHint : `media: ${media.type}`}
                </span>
            </div>
        )
    }

    // Image: the well tracks the natural aspect (16:9 until it loads) and
    // never exceeds the row — width clamps, the img contains inside it.
    return (
        <div
            className="ml-auto flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border"
            style={{ height: "100%", aspectRatio: natural ? `${natural.w} / ${natural.h}` : "16 / 9", maxWidth: "100%" }}
        >
            <img
                src={media.url}
                alt=""
                className="max-h-full max-w-full object-contain"
                onLoad={(event) => {
                    const { naturalWidth: w, naturalHeight: h } = event.currentTarget
                    if (w > 0 && h > 0) setNatural({ w, h })
                }}
                onError={() => setBroken(true)}
            />
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
