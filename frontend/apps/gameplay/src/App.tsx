import { useMemo } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams, useOutletContext } from "react-router-dom"
import { ApiError } from "@shared/lib/api"
import { AppShell } from "@/components/layout/AppShell"
import { SchedulePage } from "@/pages/SchedulePage"
import { StandingsPage } from "@/pages/StandingsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { JoinPage } from "@/pages/JoinPage"
import { PlayerShell } from "@/components/player-shell"
import { CameraPanel } from "@/components/live/CameraPanel"
import { SelfBroadcastContext, useSelfBroadcast } from "@shared/lib/rtc"
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
    const schedule = useSchedule(tournament.slug)
    // This player's own broadcast lives ABOVE every early return (one hook
    // line, one room): the deck's Rail and the CameraPanel controls both read
    // it through the context. resetKey = the match id — navigating between
    // matches re-dials even though this component never remounts.
    const selfCam = useSelfBroadcast(id ?? "")

    if (schedule.isPending) return <LoadingState />
    if (schedule.error) return <ErrorState onRetry={() => void schedule.refetch()} />

    const row = schedule.data.items.find((m) => m.id === id)
    if (!row) return <NotFoundPage />

    // The player's deck owns the whole page (L3) — LIVE renders the round,
    // anything else gates to the lobby inside the same canvas. Every other
    // match entry stays the schedule's sidebar (2510).
    // The CameraPanel is the CONTROL bar (status + mic/cam) and hides ITSELF
    // when the token says the match isn't LIVE / the seat isn't ours
    // (401/403/404/409/503); the feed itself renders in the player's own Rail
    // card through the same context.
    return (
        <SelfBroadcastContext.Provider value={selfCam}>
            <PlayerShell matchId={row.id} />
            <CameraPanel />
        </SelfBroadcastContext.Provider>
    )
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

                {/* The player's door: PIN join → the seat's GAMEPLAY session →
                    the deck at /s/:slug/matches/:id. Players live HERE, never
                    in the portal (user decision) — so it sits outside the
                    AppShell, like the portal's old /join did. */}
                <Route path="/join" element={<JoinPage />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App
