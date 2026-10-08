import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
    type Match,
    type StandingRow,
    type Tournament,
} from "@/data/schedule"
import { DaySection } from "@/components/schedule/DaySection"
import { MatchCard } from "@/components/schedule/MatchCard"
import { StageTimeline } from "@/components/schedule/StageTimeline"
import { StandingsPanel } from "@/components/standings/StandingsPanel"
import { ScheduleHeader } from "@/components/schedule/ScheduleHeader"
import { formatDay } from "@/lib/format"
import { Inbox } from "lucide-react"

const STANDINGS_PREVIEW_COUNT = 4

interface SchedulePageProps {
    tournament: Tournament
    matches: Match[]
    standings: StandingRow[]
    loading?: boolean
}


export function SchedulePage({
    tournament,
    matches,
    standings,
    loading = false,
}: SchedulePageProps) {
    const days = useMemo(
        () => [...new Set(matches.map((m) => m.date))].sort(),
        [matches]
    )

    const [day, setDay] = useState<string>(days[0] ?? "")
    const navigate = useNavigate()

    const goPrev = () => {
        const i = days.indexOf(day)
        if (i > 0) setDay(days[i - 1])
    }
    const goNext = () => {
        const i = days.indexOf(day)
        if (i > -1 && i < days.length - 1) setDay(days[i + 1])
    }
    const goToday = () => setDay(days[0] ?? "")

    const filtered = useMemo(
        () => matches.filter((m) => m.date === day),
        [matches, day]
    )

    const liveMatch = filtered.find((m) => m.status === "LIVE")
    const rest = filtered.filter((m) => m.id !== liveMatch?.id)

    const groups = useMemo(() => {
        const map = new Map<string, Match[]>()
        for (const m of rest) {
            const list = map.get(m.date)
            if (list) list.push(m)
            else map.set(m.date, [m])
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    }, [rest])


    return (
        <div className="mx-auto flex w-full flex-col max-w-360 gap-6 px-4 py-6 md:py-10">
            <ScheduleHeader
                title={tournament.name}
                dayLabel={formatDay(day)}
                onPrevDay={goPrev}
                onNextDay={goNext}
                onToday={goToday}
            />

            {loading ? (
                <ScheduleSkeleton />
            ) : (
                <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_360px]">
                    <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
                        <StageTimeline />
                    </aside>
                    
                    <div className="flex min-w-0 flex-col gap-6">
                        {liveMatch && (
                            <div className="flex flex-col gap-3">
                                <MatchCard
                                    match={liveMatch}
                                    featured
                                    onOpen={() => navigate(`/matches/${liveMatch.id}`)}
                                />
                            </div>
                        )}

                        {groups.map(([date, list]) => (
                            <DaySection
                                key={date}
                                date={date}
                                matches={list}
                                onOpenMatch={(id) => navigate(`/matches/${id}`)}
                            />
                        ))}

                        {groups.length === 0 && !liveMatch && <EmptyState />}
                    </div>

                    <StandingsPanel
                        rows={standings.slice(0, STANDINGS_PREVIEW_COUNT)}
                        viewAllLink
                    />
                </div>
            )}
        </div>
    )
}


function EmptyState() {
    return (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
            <Inbox className="size-6 text-muted-foreground" aria-hidden />
            <p className="font-medium">Hôm nay thật yên bình</p>
            <p className="text-sm text-muted-foreground">
                Không có trận đấu nào diễn ra và hôm nay
            </p>
        </div>
    )
}


function ScheduleSkeleton() {
    return (
        <div
            role="status"
            aria-label="Loading schedule"
            className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start"
        >
            <div className="flex flex-col gap-4">
                <div className="h-44 animate-pulse rounded-xl bg-muted" />
                <div className="h-44 animate-pulse rounded-xl bg-muted" />
            </div>
            <div className="h-72 animate-pulse rounded-xl bg-muted" />
        </div>
    )
}