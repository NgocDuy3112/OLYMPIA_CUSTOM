import { type Match } from "@/data/schedule"
import { MatchCard } from "./MatchCard"
import { formatDay } from "@/lib/format"

interface DaySectionProps {
    date: string
    matches: Match[]
    onOpenMatch: (id: string) => void
}

export function DaySection({ date, matches, onOpenMatch }: DaySectionProps) {
    return (
        <section className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
                <h2 className="font-heading text-lg font-semibold">{formatDay(date)}</h2>
                <span className="text-xs text-muted-foreground">
                    {matches.length} match{matches.length === 1 ? "" : "es"}
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