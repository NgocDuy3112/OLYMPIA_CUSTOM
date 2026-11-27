import type { Match } from "@shared/results/types"
import { MatchCard } from "./MatchCard"
import { formatDay } from "@shared/results/format"

interface DaySectionProps {
    date: string
    matches: Match[]
    onOpenMatch: (id: string) => void
}

export function DaySection({ date, matches, onOpenMatch }: DaySectionProps) {
    let matchSuffix = "es"
    if (matches.length === 1) matchSuffix = ""
    return (
        <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3 border-b pb-2">
                <h2 className="font-heading text-lg font-semibold">{formatDay(date)}</h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                    {matches.length} match{matchSuffix}
                </span>
            </div>
            {matches.map((match) => (
                <MatchCard 
                    key={match.id} 
                    match={match} 
                    onOpen={() => onOpenMatch(match.id)}
                />
            ))}
        </section>
    )
}