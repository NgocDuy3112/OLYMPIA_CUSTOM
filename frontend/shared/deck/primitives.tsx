import type { ReactNode } from "react"
import { CheckCircle2, Hourglass, XCircle } from "lucide-react"
import { formatRemaining } from "@shared/lib/clock"
import { DECK_PAD, pt, toClock } from "./geometry"


export function StageLayout({ rail, children }: { rail?: ReactNode; children: ReactNode }) {
    return (
        <div className="absolute inset-0 flex gap-[4cqw] p-[3cqw]">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-[1.2cqw]">{children}</div>
            {rail && <aside className="flex w-[27cqw] shrink-0 flex-col gap-[1cqw]">{rail}</aside>}
        </div>
    )
}

export function MainCard({ className = "", children }: { className?: string; children?: ReactNode }) {
    return (
        <section className={`flex min-h-0 flex-col gap-[1.2cqw] overflow-hidden rounded-2xl bg-card p-[1.6cqw] shadow-md ring-1 ring-border ${className}`}>
            {children}
        </section>
    )
}

export function CardHeader({ left, mid, right }: { left?: ReactNode; mid?: ReactNode; right?: ReactNode }) {
    return (
        <div className="flex shrink-0 items-start justify-between gap-[1.5cqw]">
            {left}
            {mid && <div className="flex min-w-0 flex-1 items-start justify-center gap-[1.1cqw]">{mid}</div>}
            {right && <div className="flex min-w-0 items-start gap-[1.6cqw]">{right}</div>}
        </div>
    )
}


export function Badges({ round, mode, size = 32 }: {
    round: string; mode?: string; size?: number
}) {
    return (
        <div className="flex shrink-0 flex-col items-start gap-[0.5cqw]">
            <span className="font-display font-bold uppercase leading-none text-foreground" style={{ fontSize: pt(size), ...DECK_PAD }}>
                {round}
            </span>
            {mode && (
                <span className="font-display font-medium leading-none text-muted-foreground" style={{ fontSize: pt(16), ...DECK_PAD }}>
                    {mode}
                </span>
            )}
        </div>
    )
}


export function Timer({ remaining, size = 40 }: {
    remaining: number | null
    size?: number
}) {
    let text = "00"
    let tone = "text-muted-foreground"
    if (remaining !== null) {
        text = toClock(formatRemaining(remaining))
        tone = "text-foreground"
    }
    return (
        <span className={`shrink-0 text-right font-display font-bold leading-none tabular-nums ${tone}`} style={{ fontSize: pt(size) }}>
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
    let statusSlot: ReactNode = <span className="text-muted-foreground">{hint}</span>
    if (error) {
        statusSlot = <span role="alert" className="font-semibold text-destructive">{error}</span>
    }
    return (
        <div className="flex shrink-0 items-center justify-end pr-[1cqw] text-right leading-tight" style={{ fontSize: pt(10), ...DECK_PAD }}>
            {statusSlot}
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
