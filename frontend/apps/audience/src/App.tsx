import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Navigate, Route, Routes, useParams } from "react-router-dom"
import { LivePage } from "@/pages/LivePage"
import { IconField } from "@shared/decors/icon-field"
import { SfxUnlockBar } from "@shared/ui/sfx-unlock-bar"
import { ErrorBoundary } from "@shared/lib/error-boundary"

const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

function LegacyLiveRedirect() {
    const { tournamentId = "", matchId = "" } = useParams()
    if (!tournamentId || !matchId) return <Navigate to="/" replace />
    const target = `/tournaments/${tournamentId}/matches/${matchId}`
    return <Navigate to={target} replace />
}

export function App() {
    return (
        <ErrorBoundary scope="audience">
            <QueryClientProvider client={client}>
                <div className="audience relative min-h-dvh text-foreground">
                    <IconField />
                    <div className="relative z-10">
                    <Routes>
                        <Route
                            path="/tournaments/:tournamentId/matches/:matchId"
                            element={<LivePage />}
                        />
                        <Route
                            path="/live/:tournamentId/:matchId"
                            element={<LegacyLiveRedirect />}
                        />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    </div>
                    <SfxUnlockBar />
                </div>
            </QueryClientProvider>
        </ErrorBoundary>
    )
}
