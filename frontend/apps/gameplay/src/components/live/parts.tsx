import type { ReactNode } from "react"
import { CheckCircle2, Hourglass, Timer, Trophy, XCircle } from "lucide-react"
import { formatRemaining, isUrgent, useCountdown, type ServerClock } from "@shared/lib/clock"
import { cn } from "cn"
import type { LiveScoreRow, LiveView } from "@/lib/live"

// What every screen receives. The clock is the SHARED one (skew from each
// pushed envelope) — no screen ever reads the local time on its own.
export interface ScreenProps {
    matchId: string
    view: LiveView
    clock: ServerClock
    /** The session's user id — to mark "my" scoreboard row. */
    meId?: string
}

// ── countdown ────────────────────────────────────────────────────────────────

/**
 * A ticking m:ss against a SERVER deadline. Ticks at 250 ms while visible and
 * recomputes on visibility return; urgent (≤5 s) turns red. null deadline →
 * renders nothing (there is no clock to show).
 */
export function Countdown({
    deadlineAt,
    clock,
    className,
    label,
}: {
    deadlineAt: string | null
    clock: ServerClock
    className?: string
    /** Small caption before the number, e.g. "còn". */
    label?: string
}) {
    const remaining = useCountdown(deadlineAt, clock)
    if (!deadlineAt) return null

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1.5 tabular-nums",
                isUrgent(remaining) ? "font-semibold text-red-600" : "text-muted-foreground",
                className
            )}
        >
            <Timer className="size-4" aria-hidden />
            {label && <span className="text-xs">{label}</span>}
            <span>{formatRemaining(remaining)}</span>
        </span>
    )
}

// ── verdicts (lucide, per the user's decision) ───────────────────────────────

export function VerdictIcon({
    verdict,
    className,
}: {
    verdict: "CORRECT" | "INCORRECT"
    className?: string
}) {
    return verdict === "CORRECT" ? (
        <CheckCircle2 className={cn("size-4 shrink-0 text-emerald-600", className)} aria-label="Đúng" />
    ) : (
        <XCircle className={cn("size-4 shrink-0 text-red-600", className)} aria-label="Chưa đúng" />
    )
}

/**
 * My own answer's state on a question: nothing (not answered), a draft awaiting
 * the MC, or the final verdict — the ✓/✗ the user asked for, in lucide.
 */
export function AnswerMark({
    answerState,
    verdict,
}: {
    answerState?: "none" | "draft" | "final"
    verdict?: "CORRECT" | "INCORRECT"
}) {
    if (answerState === "final") {
        if (!verdict) return null // judged rows always carry one; degrade quietly
        return (
            <span
                className={cn(
                    "inline-flex items-center gap-1.5 text-sm font-semibold",
                    verdict === "CORRECT" ? "text-emerald-600" : "text-red-600"
                )}
            >
                <VerdictIcon verdict={verdict} />
                {verdict === "CORRECT" ? "Đúng" : "Chưa đúng"}
            </span>
        )
    }
    if (answerState === "draft") {
        return (
            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Hourglass className="size-4" aria-hidden />
                Đã trả lời · chờ chấm
            </span>
        )
    }
    return null
}

// ── khoi-dong's budget bar ───────────────────────────────────────────────────

/**
 * The oral run's consumed budget — a BAR, never a countdown: the engine counts
 * time only when the MC records it (docs/live-surface.md G2).
 */
export function BudgetBar({ elapsedS, budgetS }: { elapsedS: number; budgetS: number }) {
    const pct = budgetS > 0 ? Math.min(100, Math.round((elapsedS / budgetS) * 100)) : 0
    return (
        <div className="flex items-center gap-3">
            <div
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={elapsedS}
                aria-valuemin={0}
                aria-valuemax={budgetS}
                aria-label="Thời gian đã dùng"
            >
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {elapsedS}s / {budgetS}s
            </span>
        </div>
    )
}

// ── the scoreboard (every screen) ────────────────────────────────────────────

export function Scoreboard({
    table,
    meId,
    title = "Bảng điểm",
    footer,
}: {
    table: LiveScoreRow[]
    meId?: string
    title?: string
    footer?: ReactNode
}) {
    return (
        <section className="rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-2 font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                <Trophy className="size-4" aria-hidden />
                {title}
            </h2>
            {table.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Chưa có điểm nào.</p>
            ) : (
                <ol className="mt-3 flex flex-col divide-y">
                    {table.map((row) => {
                        const mine = row.id === meId
                        return (
                            <li
                                key={row.id}
                                className={cn(
                                    "flex items-center gap-3 py-2 text-sm",
                                    mine && "rounded-md bg-primary/5 px-2 font-semibold"
                                )}
                            >
                                <span className="w-6 shrink-0 tabular-nums text-muted-foreground">{row.rank}</span>
                                <span className="min-w-0 flex-1 truncate">
                                    {row.displayName}
                                    {mine && <span className="ml-1.5 text-xs font-medium text-primary">(bạn)</span>}
                                </span>
                                <span className="shrink-0 font-semibold tabular-nums">{row.points}</span>
                            </li>
                        )
                    })}
                </ol>
            )}
            {footer && <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">{footer}</div>}
        </section>
    )
}
