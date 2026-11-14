import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Navigate, Route, Routes, useLocation } from "react-router-dom"
import { SfxUnlockBar } from "@shared/ui/sfx-unlock-bar"
import { LivePage } from "@/pages/LivePage"
import { RecordPage } from "@/pages/RecordPage"

const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export function App() {
    const { pathname } = useLocation()
    // the egress capture renders this page headless — a "tap to enable" bar
    // there would be burned into the recording with nobody to tap it
    const recording = pathname.startsWith("/record")

    return (
        <QueryClientProvider client={client}>
            <div className="audience min-h-dvh bg-background text-foreground">
                <Routes>
                    <Route path="/live/:tournamentId/:matchId" element={<LivePage />} />
                    <Route path="/record/:tournamentId/:matchId" element={<RecordPage />} />
                    <Route path="*" element={<Navigate to="/live" replace />} />
                </Routes>
                {!recording && <SfxUnlockBar />}
            </div>
        </QueryClientProvider>
    )
}
