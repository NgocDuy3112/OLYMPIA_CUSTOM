import { useEffect, useState } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { SchedulePage } from "@/pages/SchedulePage"
import { StandingsPage } from "@/pages/StandingsPage"
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
              tournament={sampleTournament}
              rows={sampleStandings}
              loading={loading}
            />
          }
        />
      </Routes>
    </BrowserRouter>

  )
}

export default App