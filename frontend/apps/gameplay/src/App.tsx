import { useMemo } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes, useNavigate, useParams, useOutletContext } from "react-router-dom"
import { ApiError } from "@shared/lib/api"
import { Button } from "@shared/ui/button"
import { AppShell } from "@/components/layout/AppShell"
import { SchedulePage } from "@/pages/SchedulePage"
import { StandingsPage } from "@/pages/StandingsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { MatchPage } from "@/pages/MatchPage"
import { QualificationView } from "@/components/qualification/QualificationView"
import { LiveMatchView } from "@/components/live/LiveMatchView"
import { useSchedule, useStandings, useTournament, useTournamentList, type TournamentDetail } from "@/lib/api"
import { toMatch, toStandings } from "@/lib/adapters"

interface TournamentContext { tournament: TournamentDetail }

// A 404 is an answer, not a failure: the slug simply has no tournament.
function isNotFound(error: unknown): boolean {
    return error instanceof ApiError && error.status === 404
}

function LoadingState() {
    return (
        <div
            role="status"
            aria-label="Đang tải"
            className="mx-auto w-full max-w-360 px-4 py-6 md:py-10"
        >
            <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
    )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="mx-auto flex w-full max-w-360 flex-col items-center gap-3 px-4 py-16 text-center">
            <p className="font-medium">Không tải được dữ liệu giải đấu</p>
            <p className="text-sm text-muted-foreground">
                Kết nối tới máy chủ thất bại. Vui lòng thử lại.
            </p>
            <button
                type="button"
                onClick={onRetry}
                className="rounded-md border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
                Thử lại
            </button>
        </div>
    )
}

// The tournament of the URL: its identity loads here, its schedule and standings
// load in the routes below.
function TournamentLayout() {
    const { slug } = useParams()
    const query = useTournament(slug ?? "")

    if (query.isPending) return <LoadingState />
    if (query.error) {
        if (isNotFound(query.error)) return <NotFoundPage />
        return <ErrorState onRetry={() => void query.refetch()} />
    }

    return <Outlet context={{ tournament: query.data }} />
}

function ScheduleRoute() {
    const { tournament } = useOutletContext<TournamentContext>()
    const schedule = useSchedule(tournament.slug)
    const standings = useStandings(tournament.slug)

    const matches = useMemo(
        () => schedule.data?.items.map((row) => toMatch(row, tournament.rounds)) ?? [],
        [schedule.data, tournament.rounds]
    )
    const rows = useMemo(() => toStandings(standings.data?.rows ?? []), [standings.data])

    return (
        <SchedulePage
            tournament={tournament}
            matches={matches}
            standings={rows}
            loading={schedule.isPending || standings.isPending}
        />
    )
}

function StandingsRoute() {
    const { tournament } = useOutletContext<TournamentContext>()
    const standings = useStandings(tournament.slug)
    const schedule = useSchedule(tournament.slug)

    const matches = useMemo(
        () => schedule.data?.items.map((row) => toMatch(row, tournament.rounds)) ?? [],
        [schedule.data, tournament.rounds]
    )
    const rows = useMemo(() => toStandings(standings.data?.rows ?? []), [standings.data])

    return (
        <StandingsPage
            rows={rows}
            matches={matches}
            placementTiers={tournament.placementTiers}
            loading={standings.isPending || schedule.isPending}
        />
    )
}

function MatchRoute() {
    const { tournament } = useOutletContext<TournamentContext>()
    const { id } = useParams()
    const navigate = useNavigate()
    const schedule = useSchedule(tournament.slug)

    if (schedule.isPending) return <LoadingState />
    if (schedule.error) return <ErrorState onRetry={() => void schedule.refetch()} />

    const row = schedule.data.items.find((m) => m.id === id)
    if (!row) return <NotFoundPage />

    // The mass event (kind = QUALIFICATION) has its own surface — the five
    // screens over the turns API + push socket. Standard matches render detail.
    if (row.kind === "QUALIFICATION") {
        return (
            <>
                <div className="mx-auto w-full max-w-2xl px-4 pt-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-3"
                        onClick={() => navigate(`/s/${tournament.slug}`)}
                    >
                        ◀ Lịch thi đấu
                    </Button>
                </div>
                <QualificationView matchId={row.id} />
            </>
        )
    }

    const match = toMatch(row, tournament.rounds)
    const back = () => navigate(`/s/${tournament.slug}`)

    // A STANDARD match in play has its own live surface — the seated player
    // plays along on push (L3). Every other state keeps the detail page.
    if (row.status === "LIVE") {
        return <LiveMatchView match={match} rounds={tournament.rounds} onBack={back} />
    }

    return <MatchPage match={match} rounds={tournament.rounds} onBack={back} />
}

// "/" and "/standings" lead to the CURRENT tournament — the one the staff flagged,
// or the newest when none is flagged.
function CurrentTournamentRedirect({ path }: { path: (slug: string) => string }) {
    const list = useTournamentList()

    if (list.isPending) return <LoadingState />
    if (list.error) return <ErrorState onRetry={() => void list.refetch()} />

    const tournaments = list.data.tournaments
    const current = tournaments.find((t) => t.current) ?? tournaments[tournaments.length - 1]
    if (!current) return <NotFoundPage />

    return <Navigate to={path(current.slug)} replace />
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="/" element={<CurrentTournamentRedirect path={(slug) => `/s/${slug}`} />} />
                    <Route path="/s/:slug" element={<TournamentLayout />}>
                        <Route index element={<ScheduleRoute />} />
                        <Route path="standings" element={<StandingsRoute />} />
                        <Route path="matches/:id" element={<MatchRoute />} />
                    </Route>
                    <Route path="/standings" element={<CurrentTournamentRedirect path={(slug) => `/s/${slug}/standings`} />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App
