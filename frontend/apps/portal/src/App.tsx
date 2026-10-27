import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom"
import { RequireAuth, RedirectIfSignedIn } from "@/components/require-auth"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"
import { TournamentsPage } from "./pages/TournamentsPage"
import { TournamentDetailPage } from "@/pages/TournamentDetailPage"
import { MatchPage } from "@/pages/MatchPage"
import { StagePage } from "@/pages/StagePage"
import { JoinPage } from "@/pages/JoinPage"
import { PlayerShell } from "@/components/player-shell"
import { QuestionsPage } from "@/pages/QuestionsPage"
import { McpKeysPage } from "@/pages/McpKeysPage"
import { OperatorsPage } from "@/pages/OperatorsPage"
import { PortalShell } from "@/components/portal-shell"


// The player shell reads its match from the URL — the shell itself gates on
// the GAMEPLAY session (401 → back to /join).
function PlayerShellRoute() {
  const { matchId } = useParams()
  return <PlayerShell matchId={matchId!} />
}

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

        {/* The controller's deck: signed in, but OUTSIDE the shell — full-screen
            StageShell only (the matches list's Control button lands here). */}
        <Route
          path="/tournaments/:tournamentId/matches/:matchId/stage"
          element={
            <RequireAuth>
              <StagePage />
            </RequireAuth>
          }
        />

        {/* The player's side: PIN join → the player shell. Guarded by the GAMEPLAY
            session the claim mints (NOT the portal operator session), so these
            sit outside RequireAuth. */}
        <Route path="/join" element={<JoinPage />} />
        <Route path="/play/:matchId" element={<PlayerShellRoute />} />

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