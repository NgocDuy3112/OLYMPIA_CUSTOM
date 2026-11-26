import { useMemo, useState, type ReactNode } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { openGameplayMatch } from "@shared/results/links"
import type { TournamentDetail } from "@shared/results/api"
import type { Match } from "@shared/results/types"
import { DaySection } from "@shared/results/schedule/DaySection"
import { MatchCard } from "@shared/results/schedule/MatchCard"
import { MatchDrawer } from "@shared/results/schedule/MatchDrawer"
import { StageTimeline } from "@shared/results/schedule/StageTimeline"
import { ScheduleHeader } from "@shared/results/schedule/ScheduleHeader"
import { formatDay } from "@shared/results/format"
import { EmptyState } from "@shared/ui/state"
import { Inbox } from "lucide-react"

interface SchedulePageProps {
    tournament: TournamentDetail
    matches: Match[]
    loading?: boolean
}


export function SchedulePage({
    tournament,
    matches,
    loading = false,
}: SchedulePageProps) {
    const days = useMemo(
        () => [...new Set(matches.map((m) => m.date))].sort(),
        [matches]
    )

    const [pickedDay, setDay] = useState<string | null>(null)
    let day = days[0] ?? ""
    if (pickedDay !== null) {
        if (days.includes(pickedDay)) day = pickedDay
    }
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

    const [searchParams, setSearchParams] = useSearchParams()
    const openId = searchParams.get("match")
    let openMatch: Match | null = null
    if (openId) openMatch = matches.find((m) => m.id === openId) ?? null

    const openMatchById = (id: string) => {
        const found = matches.find((m) => m.id === id)
        if (found?.status === "LIVE") {
            openGameplayMatch(navigate, tournament.id, id)
            return
        }
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set("match", id)
            return next
        })
    }

    const closeMatch = () =>
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev)
                next.delete("match")
                return next
            },
            { replace: true }
        )

    const groups = useMemo(() => {
        const map = new Map<string, Match[]>()
        for (const m of rest) {
            const list = map.get(m.date)
            if (list) list.push(m)
            else map.set(m.date, [m])
        }
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    }, [rest])


    let dayLabel = "—"
    if (days.length > 0) dayLabel = formatDay(day)

    let scheduleSlot: ReactNode = (
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden lg:sticky lg:top-20 lg:block lg:self-start">
                <StageTimeline stages={tournament.stages} />
            </aside>

            <div className="flex min-w-0 flex-col gap-6">
                {liveMatch && (
                    <div className="flex flex-col gap-3">
                        <MatchCard
                            match={liveMatch}
                            featured
                            onOpen={() => openGameplayMatch(navigate, tournament.id, liveMatch.id)}
                        />
                    </div>
                )}

                {groups.map(([date, list]) => (
                    <DaySection
                        key={date}
                        date={date}
                        matches={list}
                        onOpenMatch={openMatchById}
                    />
                ))}

                {groups.length === 0 && !liveMatch && (
                    <EmptyState
                        icon={Inbox}
                        title="Hôm nay thật yên bình"
                        description="Không có trận đấu nào diễn ra và hôm nay"
                    />
                )}
            </div>

        </div>
    )
    if (loading) scheduleSlot = <ScheduleSkeleton />

    return (
        <div className="mx-auto flex w-full flex-col max-w-360 gap-6 px-4 py-6 md:py-10">
            <ScheduleHeader
                title={tournament.name}
                dayLabel={dayLabel}
                onPrevDay={goPrev}
                onNextDay={goNext}
                onToday={goToday}
            />

            {scheduleSlot}

            <MatchDrawer
                match={openMatch}
                rounds={tournament.rounds}
                open={Boolean(openMatch)}
                onOpenChange={(next) => {
                    if (!next) closeMatch()
                }}
            />
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
