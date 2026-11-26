import { useMemo, useState } from "react"
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useNavigate, useParams } from "react-router-dom"
import { Link } from "react-router-dom"
import { ChevronDown, LogOut } from "lucide-react"
import { cn } from "cn"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@shared/ui/dropdown-menu"
import { buttonVariants } from "@shared/ui/button"
import { Button } from "@shared/ui/button"
import { isUnauthorized, useLogout, useMe } from "@shared/session"
import { useTournament, useTournamentList } from "@shared/results/api"
import { toMatch, toStandings } from "@shared/results/adapters"
import { useSchedule, useStandings } from "@shared/results/api"
import { SchedulePage } from "@shared/results/SchedulePage"
import { StandingsPage } from "@shared/results/StandingsPage"
import { EnterMatchDialog } from "./EnterMatchDialog"
import { LoginPage } from "./pages/LoginPage"
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage"
import { ChangePasswordPage } from "@shared/results/ChangePasswordPage"
import { CodePage } from "./pages/CodePage"
import { ErrorBoundary } from "@shared/lib/error-boundary"
import { IconField } from "@shared/decors/icon-field"
import { GlowWash } from "@shared/decors/glow-wash"

export function ResultsNav({ tournamentId }: { tournamentId?: string }) {
    const [enterOpen, setEnterOpen] = useState(false)
    const list = useTournamentList()
    const tournaments = list.data?.tournaments ?? []
    const navigate = useNavigate()

    return (
        <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
            <div className="mx-auto flex h-14 w-full items-center gap-4 px-4">
                <NavLink to="/" className="font-heading text-2xl font-bold">AOC</NavLink>
                <nav className="flex items-center gap-1">
                    <NavLink
                        to={`/tournaments/${tournamentId ?? ""}`}
                        end
                        className={({ isActive }) =>
                            cn(buttonVariants({ variant: "ghost", size: "sm" }), isActive && "bg-secondary font-medium text-secondary-foreground")
                        }
                    >
                        Lịch thi đấu
                    </NavLink>
                    <NavLink
                        to={`/tournaments/${tournamentId ?? ""}/standings`}
                        className={({ isActive }) =>
                            cn(buttonVariants({ variant: "ghost", size: "sm" }), isActive && "bg-secondary font-medium text-secondary-foreground")
                        }
                    >
                        Bảng xếp hạng
                    </NavLink>
                    <DropdownMenu>
                        <DropdownMenuTrigger className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                            Giải đấu
                            <ChevronDown className="size-3.5" aria-hidden />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {tournaments.map((tournament) => (
                                <DropdownMenuItem key={tournament.id} onClick={() => navigate(`/tournaments/${tournament.id}`)}>
                                    <span className={cn("size-1.5 rounded-full", tournament.current ? "bg-destructive" : "bg-transparent")} aria-hidden />
                                    {tournament.name}
                                    {tournament.current && <span className="ml-auto text-xs text-muted-foreground">Hiện tại</span>}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </nav>
                <AccountSlot onEnterMatch={() => setEnterOpen(true)} />
            </div>
            <EnterMatchDialog open={enterOpen} onClose={() => setEnterOpen(false)} />
        </header>
    )
}

function AccountSlot({ onEnterMatch }: { onEnterMatch: () => void }) {
    const me = useMe()
    const logout = useLogout()

    if (me.isPending) {
        return <span className="ml-auto h-9 w-24 animate-pulse rounded-md bg-muted" aria-hidden />
    }
    const user = me.data
    if (!user || isUnauthorized(me.error)) {
        return (
            <div className="ml-auto flex items-center gap-2">
                <Link
                    to="/login"
                    className={cn(buttonVariants({ variant: "default", size: "lg" }))}
                >
                    Đăng nhập
                </Link>
            </div>
        )
    }
    return (
        <div className="ml-auto flex items-center gap-2">
            <span className="max-w-40 truncate text-sm text-muted-foreground">{user.displayName}</span>
            <Button variant="default" size="lg" onClick={onEnterMatch}>
                Vào trận
            </Button>
            <Button variant="ghost" size="sm" aria-label="Đăng xuất" onClick={() => logout.mutate()}>
                <LogOut className="size-4" aria-hidden />
            </Button>
        </div>
    )
}

function AppShell() {
    return (
        <div className="flex h-dvh flex-col">
            <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}

function LoadingState() {
    return (
        <div role="status" aria-label="Đang tải" className="mx-auto w-full max-w-360 px-4 py-6 md:py-10">
            <div className="h-96 animate-pulse rounded-xl bg-muted" />
        </div>
    )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="mx-auto flex w-full max-w-360 flex-col items-center gap-3 px-4 py-16 text-center">
            <p className="font-medium">Không tải được dữ liệu giải đấu</p>
            <p className="text-sm text-muted-foreground">Kết nối tới máy chủ thất bại. Vui lòng thử lại.</p>
            <button
                type="button"
                onClick={onRetry}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
                Thử lại
            </button>
        </div>
    )
}

function TournamentLayout() {
    const { tournamentId } = useParams()
    const query = useTournament(tournamentId ?? "")

    if (query.isPending) return <LoadingState />
    if (query.error) return <ErrorState onRetry={() => void query.refetch()} />

    return (
        <>
            <ResultsNav tournamentId={tournamentId} />
            <Outlet />
        </>
    )
}

function ScheduleRoute() {
    const { tournamentId } = useParams()
    const tournament = useTournament(tournamentId ?? "").data!
    const schedule = useSchedule(tournament.id)

    const matches = useMemo(
        () => schedule.data?.items.map((row) => toMatch(row, tournament.rounds)) ?? [],
        [schedule.data, tournament.rounds],
    )
    return <SchedulePage tournament={tournament} matches={matches} loading={schedule.isPending} />
}

function StandingsRoute() {
    const { tournamentId } = useParams()
    const tournament = useTournament(tournamentId ?? "").data!
    const standings = useStandings(tournament.id)
    const schedule = useSchedule(tournament.id)

    const matches = useMemo(
        () => schedule.data?.items.map((row) => toMatch(row, tournament.rounds)) ?? [],
        [schedule.data, tournament.rounds],
    )
    const rows = useMemo(() => toStandings(standings.data?.rows ?? []), [standings.data])

    if (standings.isPending || schedule.isPending) return <LoadingState />
    return <StandingsPage rows={rows} matches={matches} loading={standings.isPending} />
}

function PlainLayout() {
    return (
        <>
            <ResultsNav />
            <Outlet />
        </>
    )
}

function RootRedirect() {
    const list = useTournamentList()

    if (list.isPending || !list.data) return <LoadingState />
    if (list.error) return <ErrorState onRetry={() => void list.refetch()} />

    const tournaments = list.data.tournaments
    const current = tournaments.find((t) => t.current) ?? tournaments[tournaments.length - 1]
    if (!current) {
        return (
            <>
                <ResultsNav />
                <div className="mx-auto flex w-full max-w-360 flex-col items-center gap-3 px-4 py-16 text-center">
                    <p className="font-medium">Chưa có giải đấu nào</p>
                    <p className="text-sm text-muted-foreground">
                        Danh sách giải sẽ xuất hiện ở đây khi ban tổ chức tạo.
                    </p>
                </div>
            </>
        )
    }

    return <Navigate to={`/tournaments/${current.id}`} replace />
}

function NotFoundPage() {
    return (
        <div className="mx-auto flex w-full max-w-360 flex-col items-center gap-3 px-4 py-16 text-center">
            <p className="font-medium">Không tìm thấy trang</p>
        </div>
    )
}

function App() {
    return (
        <ErrorBoundary scope="results">
            <IconField />
            <GlowWash />
            <div className="relative z-10">
            <BrowserRouter>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/tournaments/:tournamentId" element={<TournamentLayout />}>
                        <Route index element={<ScheduleRoute />} />
                        <Route path="standings" element={<StandingsRoute />} />
                    </Route>
                    <Route element={<PlainLayout />}>
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        <Route path="/password" element={<ChangePasswordPage />} />
                        <Route path="/code" element={<CodePage />} />
                    </Route>
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
            </BrowserRouter>
            </div>
        </ErrorBoundary>
    )
}

export default App
