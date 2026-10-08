import { useEffect, useState } from "react"
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useParams,
  useOutletContext,
} from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { SchedulePage } from "@/pages/SchedulePage"
import { StandingsPage } from "@/pages/StandingsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { MatchPage } from "@/pages/MatchPage"
import { LoginPage } from "./pages/LoginPage"
import { SignupPage } from "./pages/SignUpPage"
import {
  CURRENT_SEASON,
  findSeason,
  type Season,
} from "@/data/seasons"

interface SeasonContext {
  season: Season
  loading: boolean
}

// Resolves /s/:seasonId → Season; unknown season reuses NotFoundPage
function SeasonLayout({ loading }: { loading: boolean }) {
  const { seasonId } = useParams()
  const season = findSeason(seasonId)

  if (!season) {
    return <NotFoundPage />
  }

  return <Outlet context={{ season, loading }} />
}

function ScheduleRoute() {
  const { season, loading } = useOutletContext<SeasonContext>()
  return (
    <SchedulePage
      tournament={season.tournament}
      matches={season.matches}
      standings={season.standings}
      loading={loading}
    />
  )
}

function StandingsRoute() {
  const { season, loading } = useOutletContext<SeasonContext>()
  return (
    <StandingsPage
      rows={season.standings}
      matches={season.matches}
      loading={loading}
    />
  )
}

function MatchRoute() {
  const { season } = useOutletContext<SeasonContext>()
  return <MatchPage matches={season.matches} />
}

function App() {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 600)
    return () => clearTimeout(timer)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={<Navigate to={`/s/${CURRENT_SEASON.id}`} replace />}
          />
          <Route
            path="/s/:seasonId"
            element={<SeasonLayout loading={loading} />}
          >
            <Route index element={<ScheduleRoute />} />
            <Route path="standings" element={<StandingsRoute />} />
            <Route path="matches/:id" element={<MatchRoute />} />
          </Route>

          {/* legacy URL compat — old /standings bookmarks */}
          <Route
            path="/standings"
            element={<Navigate to={`/s/${CURRENT_SEASON.id}/standings`} replace />}
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="*" element={<NotFoundPage />} />   
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App