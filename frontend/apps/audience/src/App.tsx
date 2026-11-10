import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Navigate, Route, Routes } from "react-router-dom"
import { LivePage } from "@/pages/LivePage"
import { RecordPage } from "@/pages/RecordPage"

const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export function App() {
    return (
        <QueryClientProvider client={client}>
            <div className="audience min-h-dvh bg-background text-foreground">
                <Routes>
                    <Route path="/live/:tournamentId/:matchId" element={<LivePage />} />
                    <Route path="/record/:tournamentId/:matchId" element={<RecordPage />} />
                    <Route path="*" element={<Navigate to="/live" replace />} />
                </Routes>
            </div>
        </QueryClientProvider>
    )
}
