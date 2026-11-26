import { useEffect } from "react"
import { BrowserRouter, Outlet, Route, Routes, useParams, useOutletContext } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { PrivacyPage } from "@/pages/PrivacyPage"
import { PlayerShell } from "@/components/player-shell"
import { ApiError } from "@shared/lib/api"
import { requiredEnv } from "@shared/results/links"
import { SelfBroadcastContext, useSelfBroadcast } from "@shared/lib/rtc"
import { useSchedule, useTournament, type TournamentDetail } from "@shared/results/api"
import { IconField } from "@shared/decors/icon-field"
import { GlowWash } from "@shared/decors/glow-wash"
import { ErrorBoundary } from "@shared/lib/error-boundary"
import { ErrorPanel, LoadingState } from "@shared/ui/state"
import { ChangePasswordPage } from "@shared/results/ChangePasswordPage"

interface TournamentContext { tournament: TournamentDetail }

function isNotFound(error: unknown): boolean {
    return error instanceof ApiError && error.status === 404
}

function TournamentLayout() {
    const { tournamentId } = useParams()
    const query = useTournament(tournamentId ?? "")

    if (query.isPending) return <LoadingState />
    if (query.error) {
        if (isNotFound(query.error)) return <NotFoundPage />
        return <ErrorPanel
                title="Không tải được dữ liệu giải đấu"
                message="Kết nối tới máy chủ thất bại. Vui lòng thử lại."
                onRetry={() => void query.refetch()}
            />
    }

    return <Outlet context={{ tournament: query.data }} />
}

function MatchRoute() {
    const { tournament } = useOutletContext<TournamentContext>()
    const { id } = useParams()
    const schedule = useSchedule(tournament.id)
    const selfCam = useSelfBroadcast(id ?? "")

    if (schedule.isPending) return <LoadingState />
    if (schedule.error) return <ErrorPanel
                title="Không tải được dữ liệu giải đấu"
                message="Kết nối tới máy chủ thất bại. Vui lòng thử lại."
                onRetry={() => void schedule.refetch()}
            />

    const row = schedule.data.items.find((m) => m.id === id)
    if (!row) return <NotFoundPage />

    return (
        <SelfBroadcastContext.Provider value={selfCam}>
            <PlayerShell matchId={row.id} />
        </SelfBroadcastContext.Provider>
    )
}

function RootRedirect() {
    useEffect(() => {
        window.location.replace(`${requiredEnv("VITE_RESULTS_BASE_URL")}/`)
    }, [])
    return null
}

function App() {
    return (
        <ErrorBoundary scope="gameplay">
            <IconField />
            <GlowWash />
            <div className="relative z-10">
            <BrowserRouter>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/tournaments/:tournamentId" element={<TournamentLayout />}>
                        <Route path="matches/:id" element={<MatchRoute />} />
                    </Route>
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/password" element={<ChangePasswordPage />} />
                    
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
            </BrowserRouter>
            </div>
        </ErrorBoundary>
    )
}

export default App
