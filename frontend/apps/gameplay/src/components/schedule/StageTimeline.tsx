import { Check } from "lucide-react"
import { cn } from "cn"
import type { Stage } from "@/lib/api"

// The tournament's own stage list — the spine of the show. Each stage window is
// an ISO datetime on the wire; the timeline compares DAYS.

type StageState = "done" | "current" | "upcoming"

const day = (iso: string) => iso.slice(0, 10)

function stateOf(stage: Stage, today: string): StageState {
    if (stage.end && today > day(stage.end)) return "done"
    if (stage.start && today < day(stage.start)) return "upcoming"
    return "current"
}

function formatRange({ start, end }: Stage): string | null {
    if (!start || !end) return null
    const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
    return `${fmt(start)} – ${fmt(end)}`
}

interface StageTimelineProps {
    stages: Stage[]
}

export function StageTimeline({ stages }: StageTimelineProps) {
    const today = new Date().toISOString().slice(0, 10)

    if (stages.length === 0) return null

    return (
        <nav aria-label="Các vòng thi đấu">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tiến độ giải đấu
            </h2>
            <ol className="flex flex-col">
                {stages.map((stage, i) => {
                    const state = stateOf(stage, today)
                    const isLast = i === stages.length - 1
                    const range = formatRange(stage)

                    return (
                        <li key={stage.id} className="relative flex gap-3 pb-6 last:pb-0">
                            {!isLast && (
                                <span
                                    aria-hidden
                                    className="absolute left-2.75 top-7 bottom-0 w-0.5 bg-border"
                                />
                            )}
                            <span
                                className={cn(
                                    "z-10 flex size-6 shrink-0 items-center justify-center rounded-full",
                                    state === "done" &&
                                    "bg-primary text-primary-foreground",
                                    state === "current" &&
                                    "border-2 border-primary bg-background",
                                    state === "upcoming" &&
                                    "border-2 border-border bg-background"
                                )}
                            >
                                {state === "done" && (
                                    <Check className="size-3.5" strokeWidth={3} />
                                )}
                                {state === "current" && (
                                    <span className="size-2 rounded-full bg-primary" />
                                )}
                            </span>

                            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                                <span
                                    className={cn(
                                        "text-sm font-semibold",
                                        state === "upcoming" && "text-muted-foreground"
                                    )}
                                >
                                    {stage.title}
                                </span>
                                {range && (
                                    <span className="text-xs tracking-wider text-muted-foreground tabular-nums uppercase">
                                        {range}
                                    </span>
                                )}
                            </div>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}
