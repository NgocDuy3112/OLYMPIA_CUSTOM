import { useEffect, useState } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams, useOutletContext } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { SchedulePage } from "@/pages/SchedulePage"
import { StandingsPage } from "@/pages/StandingsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { MatchPage } from "@/pages/MatchPage"
import { CURRENT_SEASON, findTournament, type Tournament } from "@/data/tournaments"

interface TournamentContext { tournament: Tournament; loading: boolean }

function TournamentLayout({ loading }: { loading: boolean }) {
    const { tournamentId } = useParams()
    const tournament = findTournament(tournamentId)
    if (!tournament) return <NotFoundPage />
    return <Outlet context={{ tournament, loading }} />
}

function ScheduleRoute() {
    const { tournament, loading } = useOutletContext<TournamentContext>()
    return <SchedulePage tournament={tournament} matches={tournament.matches} standings={tournament.standings} loading={loading} />
}

function StandingsRoute() {
    const { tournament, loading } = useOutletContext<TournamentContext>()
    return <StandingsPage rows={tournament.standings} matches={tournament.matches} loading={loading} />
}

function MatchRoute() {
    const { tournament } = useOutletContext<TournamentContext>()
    return <MatchPage matches={tournament.matches} />
}

function App() {
    const [loading, setLoading] = useState(true)
    useEffect(() => {
        const t = setTimeout(() => setLoading(false), 600)
        return () => clearTimeout(t)
    }, [])

    return (
        <BrowserRouter>
            <Routes>
                <Route element={<AppShell />}>
                    <Route path="/" element={<Navigate to={`/s/${CURRENT_SEASON.id}`} replace />} />
                    <Route path="/s/:tournamentId" element={<TournamentLayout loading={loading} />}>
                        <Route index element={<ScheduleRoute />} />
                        <Route path="standings" element={<StandingsRoute />} />
                        <Route path="matches/:id" element={<MatchRoute />} />
                    </Route>
                    <Route path="/standings" element={<Navigate to={`/s/${CURRENT_SEASON.id}/standings`} replace />} />
                    <Route path="*" element={<NotFoundPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    )
}

export default App