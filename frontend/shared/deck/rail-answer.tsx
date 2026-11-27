import { formatDurationMs } from "@shared/lib/clock"
import { TYPE, pt } from "./geometry"

export function RailAnswerLine({ answer, answeredMs, buzzLabel, buzzMs }: {
    answer?: string | null
    answeredMs?: number | null
    buzzLabel?: string | null
    buzzMs?: number | null
}) {
    const hasAnswer = typeof answer === "string" && answer !== "" && answer !== "—"
    const hasTime = typeof answeredMs === "number"
    const hasBuzz = typeof buzzLabel === "string"
    if (!hasAnswer && !hasTime && !hasBuzz) return null
    return (
        <>
            {hasAnswer && (
                <span
                    className="block w-full min-h-0 shrink overflow-hidden text-center font-sans leading-tight break-words line-clamp-2 text-foreground"
                    style={{ fontSize: pt(TYPE.label) }}
                    title={answer ?? undefined}
                >
                    {answer}
                </span>
            )}
            {(hasTime || hasBuzz) && (
                <span
                    className="flex w-full shrink-0 flex-wrap items-center justify-center gap-[0.3cqw] font-sans leading-none text-foreground/85"
                    style={{ fontSize: pt(TYPE.meta) }}
                >
                    {hasTime && (
                        <span className="tabular-nums text-muted-foreground">
                            {formatDurationMs(answeredMs as number)}
                        </span>
                    )}
                    {hasTime && hasBuzz && <span className="text-muted-foreground">·</span>}
                    {hasBuzz && (
                        <span className="flex items-center gap-[0.25cqw] whitespace-nowrap">
                            <span>{buzzLabel}</span>
                            {typeof buzzMs === "number" && (
                                <span className="tabular-nums text-muted-foreground">
                                    {formatDurationMs(buzzMs)}
                                </span>
                            )}
                        </span>
                    )}
                </span>
            )}
        </>
    )
}
