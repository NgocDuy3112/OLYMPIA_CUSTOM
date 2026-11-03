import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Navigate, Route, Routes } from "react-router-dom"
import { LivePage } from "@/pages/LivePage"

// The audience app: public routes only. No session, no auth shell, nothing to
// write. Today that is the live deck; the public tournament pages (/public/*)
// land here when the backend grows those reads.
const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
})

export function App() {
    return (
        <QueryClientProvider client={client}>
            <div className="audience min-h-dvh bg-background text-foreground">
                <Routes>
                    <Route path="/live/:tournamentId/:matchId" element={<LivePage />} />
                    <Route path="*" element={<Navigate to="/live" replace />} />
                </Routes>
            </div>
        </QueryClientProvider>
    )
}
