import type { ReactNode } from "react"
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

export function MainCard({ className = "", children }: { className?: string; children?: ReactNode }) {
    return (
        <section className={`flex min-h-0 flex-1 flex-col gap-[1.2cqw] overflow-hidden rounded-2xl bg-card p-[1.6cqw] shadow-md ring-1 ring-border ${className}`}>
            {children}
        </section>
    )
}

export function CardHeader({ left, mid, right }: { left?: ReactNode; mid?: ReactNode; right?: ReactNode }) {
    return (
        <div className="flex shrink-0 items-start justify-between gap-[1.5cqw]">
            {left}
            {mid && <div className="flex min-w-0 flex-1 items-start justify-center gap-[1.1cqw]">{mid}</div>}
            {right && <div className="flex shrink-0 items-start gap-[1.6cqw]">{right}</div>}
        </div>
    )
}


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


type SquareState = "done" | "active" | "pending"
const SQUARE: Record<SquareState, string> = {
    done: "bg-primary text-primary-foreground",
    active: "bg-card text-foreground ring-2 ring-primary",
    pending: "bg-card text-muted-foreground ring-1 ring-border",
}
const squareState = (i: number, done: number, active: number): SquareState =>
    i < done ? "done" : i === active ? "active" : "pending"

export function Progress({ total, done, active, onPick }: { total: number; done: number; active: number; onPick?: (i: number) => void }) {
    return (
        <div className="flex shrink-0 items-center gap-[0.98cqw]">
            {Array.from({ length: total }, (_, i) => {
                const className = `flex items-center justify-center font-display font-bold leading-none ${SQUARE[squareState(i, done, active)]} ${onPick ? "cursor-pointer hover:ring-sky-500" : ""}`
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


export function Timer({ remaining, fallback, size = 40 }: {
    remaining: number | null
    /** shown only while no countdown is running — omit it and the slot stays empty */
    fallback?: string
    size?: number
}) {
    if (remaining === null && fallback === undefined) return null
    const text = toClock(remaining !== null ? formatRemaining(remaining) : fallback as string)
    return (
        <span className="shrink-0 text-right font-display font-bold leading-none tabular-nums text-foreground" style={{ fontSize: pt(size) }}>
            {text}
        </span>
    )
}


export function VerdictIcon({ verdict }: { verdict: "CORRECT" | "INCORRECT" | null | undefined }) {
    if (verdict === "CORRECT") return <CheckCircle2 className="size-[1.15em] shrink-0 text-emerald-600" aria-label="Đúng" />
    if (verdict === "INCORRECT") return <XCircle className="size-[1.15em] shrink-0 text-red-600" aria-label="Sai" />
    return <Hourglass className="size-[1.15em] shrink-0 text-amber-500" aria-label="Chưa chấm" />
}

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
