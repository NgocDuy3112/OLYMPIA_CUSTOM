import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { RequireAuth, RedirectIfSignedIn } from "@/components/require-auth"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"
import { TournamentsPage } from "./pages/TournamentsPage"
import { TournamentDetailPage } from "@/pages/TournamentDetailPage"
import { MatchPage } from "@/pages/MatchPage"
import { QuestionsPage } from "@/pages/QuestionsPage"
import { McpKeysPage } from "@/pages/McpKeysPage"
import { OperatorsPage } from "@/pages/OperatorsPage"
import { PortalShell } from "@/components/portal-shell"


export default function App() {
  return (
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
          <Route path="/tournaments/:tournamentId" element={<TournamentDetailPage />} />
          {/* The match's own page: every match operation lives here (2310). */}
          <Route path="/tournaments/:tournamentId/matches/:matchId" element={<MatchPage />} />
          <Route path="/questions" element={<QuestionsPage />} />
          <Route path="/mcp-keys" element={<McpKeysPage />} />
          <Route path="/operators" element={<OperatorsPage />} />
        </Route>

        <Route
          path="/login"
          element={
            <RedirectIfSignedIn>
              <LoginPage />
            </RedirectIfSignedIn>
          }
        />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}