import { useEffect, useState } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AppShell } from "@/components/layout/AppShell"
import { SchedulePage } from "@/pages/SchedulePage"
import { StandingsPage } from "@/pages/StandingsPage"
import { NotFoundPage } from "./pages/NotFoundPage"
import { sampleMatches, sampleStandings, sampleTournament } from "@/data/sample"

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
            element={
              <SchedulePage
                tournament={sampleTournament}
                matches={sampleMatches}
                standings={sampleStandings}
                loading={loading}
              />
            }
          />
          <Route
            path="/standings"
            element={
              <StandingsPage
                rows={sampleStandings}
                matches={sampleMatches}
                loading={loading}
              />
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App