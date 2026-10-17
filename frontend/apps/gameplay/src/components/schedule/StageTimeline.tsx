import { Check } from "lucide-react"
import { cn } from "cn"
import { OLYMPIA_STAGES, type Stage } from "@/data/stages"

type StageState = "done" | "current" | "upcoming"

function stateOf(stage: Stage, today: string): StageState {
    if (today > stage.end) return "done"
    if (today < stage.start) return "upcoming"
    return "current"
}

function formatRange({ start, end }: Stage): string {
    const fmt = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
    return `${fmt(start)} – ${fmt(end)}`
}

export function StageTimeline() {
    const today = new Date().toISOString().slice(0, 10)

    return (
        <nav aria-label="Các vòng thi đấu">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tiến độ giải đấu
            </h2>
            <ol className="flex flex-col">
                {OLYMPIA_STAGES.map((stage, i) => {
                    const state = stateOf(stage, today)
                    const isLast = i === OLYMPIA_STAGES.length - 1

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
                                <span className="text-xs tracking-wider text-muted-foreground tabular-nums uppercase">
                                    {formatRange(stage)}
                                </span>
                            </div>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}