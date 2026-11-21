import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Navigate, Route, Routes } from "react-router-dom"
import { LivePage } from "@/pages/LivePage"
import { IconField } from "@shared/decors/icon-field"
import { SfxUnlockBar } from "@shared/ui/sfx-unlock-bar"
import { ErrorBoundary } from "@shared/lib/error-boundary"

const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export function App() {
    return (
        <ErrorBoundary scope="audience">
            <QueryClientProvider client={client}>
                <div className="audience relative min-h-dvh text-foreground">
                    <IconField />
                    <Routes>
                        <Route path="/live/:tournamentId/:matchId" element={<LivePage />} />
                        <Route path="*" element={<Navigate to="/live" replace />} />
                    </Routes>
                    <SfxUnlockBar />
                </div>
            </QueryClientProvider>
        </ErrorBoundary>
    )
}
