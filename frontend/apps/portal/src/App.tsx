import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { RequireAuth, RedirectIfSignedIn } from "@/components/require-auth"
import { LoginPage } from "@/pages/LoginPage"
import { TournamentsPage } from "./pages/TournamentsPage"
import { TournamentDetailPage } from "@/pages/TournamentDetailPage"
import { PlayersPage } from "@/pages/PlayersPage"
import { MatchPage } from "@/pages/MatchPage"
import { StagePage } from "@/pages/StagePage"
import { QuestionsPage } from "@/pages/QuestionsPage"
import { McpKeysPage } from "@/pages/McpKeysPage"
import { OperatorsPage } from "@/pages/OperatorsPage"
import { PortalShell } from "@/components/portal-shell"
import { IconField } from "@shared/decors/icon-field"
import { GlowWash } from "@shared/decors/glow-wash"
import { ErrorBoundary } from "@shared/lib/error-boundary"


export default function App() {
  return (
    <ErrorBoundary scope="portal">
      <IconField />
      <GlowWash />
      <BrowserRouter>
      <Routes>
        <Route
          element={
            <RequireAuth>
              <PortalShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<TournamentsPage />} />
          <Route path="/players" element={<PlayersPage />} />
          <Route path="/tournaments/:tournamentId" element={<TournamentDetailPage />} />
          
          <Route path="/tournaments/:tournamentId/matches/:matchId" element={<MatchPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/mcp-keys" element={<McpKeysPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
        </Route>

        
        <Route
          path="/tournaments/:tournamentId/matches/:matchId/control"
          element={
            <RequireAuth>
              <ErrorBoundary scope="portal:control">
                <StagePage />
              </ErrorBoundary>
            </RequireAuth>
          }
        />

        <Route
          path="/login"
          element={
            <RedirectIfSignedIn>
              <LoginPage />
            </RedirectIfSignedIn>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
