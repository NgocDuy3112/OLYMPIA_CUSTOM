import type { QuestionUsageItem } from "./model"

export function QuestionUsageCell({ matches }: { matches?: QuestionUsageItem[] }) {
    if (!matches || matches.length === 0) return <span className="text-xs text-muted-foreground">—</span>
    return (
        <span className="flex flex-wrap gap-1">
            {matches.map((match) => (
                <span
                    key={match.id}
                    className="rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground"
                    title={`${match.label} · ${match.status}`}
                >
                    {match.label}
                </span>
            ))}
        </span>
    )
}
