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

interface TournamentContext { tournament: TournamentDetail }

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

function TournamentLayout() {
    const { tournamentId } = useParams()
    const query = useTournament(tournamentId ?? "")

    if (query.isPending) return <LoadingState />
    if (query.error) {
        if (isNotFound(query.error)) return <NotFoundPage />
        return <ErrorState onRetry={() => void query.refetch()} />
    }

    return <Outlet context={{ tournament: query.data }} />
}

function MatchRoute() {
    const { tournament } = useOutletContext<TournamentContext>()
    const { id } = useParams()
    const schedule = useSchedule(tournament.id)
    const selfCam = useSelfBroadcast(id ?? "")

    if (schedule.isPending) return <LoadingState />
    if (schedule.error) return <ErrorState onRetry={() => void schedule.refetch()} />

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
        <>
            <IconField />
            <GlowWash />
            <BrowserRouter>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="/" element={<RootRedirect />} />
                    <Route path="/tournaments/:tournamentId" element={<TournamentLayout />}>
                        <Route path="matches/:id" element={<MatchRoute />} />
                    </Route>
                    <Route path="/privacy" element={<PrivacyPage />} />
                    
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
            </BrowserRouter>
        </>
    )
}

export default App
