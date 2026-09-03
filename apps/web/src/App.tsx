import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/auth/LoginPage";
import AuthCallbackPage from "@/pages/auth/AuthCallbackPage";
import RulesPage from "@/pages/info/RulesPage";

const PlayerRoutes = lazy(() => import("@/routes/PlayerRoutes"));
const AdminRoutes = lazy(() => import("@/routes/AdminRoutes"));
const MCRoutes = lazy(() => import("@/routes/MCRoutes"));
const SpectatorRoutes = lazy(() => import("@/routes/SpectatorRoutes"));
const TournamentRoutes = lazy(() => import("@/routes/TournamentRoutes"));
const OverlayRoutes = lazy(() => import("@/routes/OverlayRoutes"));

function App() {
  return (
    <BrowserRouter>
      <div
        className="min-h-screen bg-oc bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/background/OC3_background.png')` }}
      >
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/player/*" element={<PlayerRoutes />} />
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="/mc/*" element={<MCRoutes />} />
            <Route path="/info/rules" element={<RulesPage />} />
            <Route path="/tournament/*" element={<TournamentRoutes />} />
            <Route path="/spectator/*" element={<SpectatorRoutes />} />
            <Route path="/overlay/*" element={<OverlayRoutes />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;
