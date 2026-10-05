import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import SignInPage from "@/pages/auth/SignInPage";
import AuthCallbackPage from "@/pages/auth/AuthCallbackPage";
import RulesPage from "@/pages/info/RulesPage";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Toaster } from "@/components/ui/toast";
import { ENABLE_OVERLAY } from "@/configs";
import { AuthGuard } from "@/components/auth/AuthGuard";

const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));

const PlayerRoutes = lazy(() => import("@/routes/PlayerRoutes"));
const AdminRoutes = lazy(() => import("@/routes/AdminRoutes"));
const ControllerRoutes = lazy(() => import("@/routes/ControllerRoutes"));
const MCRoutes = lazy(() => import("@/routes/MCRoutes"));
const SpectatorRoutes = lazy(() => import("@/routes/SpectatorRoutes"));
const TournamentRoutes = lazy(() => import("@/routes/TournamentRoutes"));
const OverlayRoutes = lazy(() => import("@/routes/OverlayRoutes"));
const QAuthorRoutes = lazy(() => import("@/routes/QAuthorRoutes"));
const ProfileRoutes = lazy(() => import("@/routes/ProfileRoutes"));
const PublicProfilePage = lazy(() => import("@/pages/profile/PublicProfilePage"));

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-oc bg-cover bg-center bg-no-repeat">
        <Suspense fallback={null}>
          <ErrorBoundary>
          <Toaster />
          <Routes>
            <Route path="/" element={<Navigate to="/tournament/*" replace />} />
            <Route path="/login" element={<SignInPage />} />
            {}
            <Route
              path="/login/admin"
              element={<Navigate to="/login?role=admin" replace />}
            />
            <Route
              path="/login/operator"
              element={<Navigate to="/login?role=operator" replace />}
            />
            <Route
              path="/login/staffs"
              element={<Navigate to="/login?role=admin" replace />}
            />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/player/*" element={<PlayerRoutes />} />
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="/operator/controller/*" element={<ControllerRoutes />} />
            <Route path="/operator/qauthor/*" element={<QAuthorRoutes />} />
            <Route path="/operator/mc/*" element={<MCRoutes />} />
            <Route
              path="/settings"
              element={
                <AuthGuard>
                  <SettingsPage />
                </AuthGuard>
              }
            />
            <Route
              path="/operator/mcp-tokens"
              element={<Navigate to="/settings" replace />}
            />
            <Route
              path="/operator/mcp-tokens/*"
              element={<Navigate to="/settings" replace />}
            />
            <Route path="/info/rules" element={<RulesPage />} />
            <Route path="/tournament/*" element={<TournamentRoutes />} />
            <Route path="/profile" element={<ProfileRoutes />} />
            <Route path="/u/:userCode" element={<PublicProfilePage />} />
            <Route path="/spectator/*" element={<SpectatorRoutes />} />
            <Route
              path="/overlay/*"
              element={
                ENABLE_OVERLAY ? (
                  <OverlayRoutes />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
          </Routes>
          </ErrorBoundary>
        </Suspense>
      </div>
    </BrowserRouter>
  );
}

export default App;
