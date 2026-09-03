import { useEffect, useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";

import ButPhaPage from "@/pages/game/ButPhaPage";
import KhoiDongChungPage from "@/pages/game/KhoiDongChungPage";
import KhoiDongRiengPage from "@/pages/game/KhoiDongRiengPage";
import GiaiMaPage from "@/pages/game/GiaiMaPage";
import VeDichChungPage from "@/pages/game/VeDichChungPage";
import VeDichRiengPage from "@/pages/game/VeDichRiengPage";
import WaitingPage from "@/pages/game/WaitingPage";
import VeDichPickPage from "@/pages/game/VeDichPickPage";
import AGameManagingPage from "@/pages/admin/AGameManagingPage";
import TournamentListPage from "@/pages/admin/tournament/TournamentListPage";
import TournamentFormPage from "@/pages/admin/tournament/TournamentFormPage";
import TournamentDetailPage from "@/pages/admin/tournament/TournamentDetailPage";
import { GameWebSocketProvider } from "@/contexts/GameWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AdminHeader, AdminSidebar } from "@/components/layout";
import { VeDichRound } from "@/types/veDich";

const AdminAutoNavigator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastMessage, sendMessage } = useGameWebSocket();
  const matchCode = localStorage.getItem("matchCode") || "";
  useEffect(() => {
    const msg = (lastMessage?.message ?? lastMessage) as {
      type?: string;
      path?: unknown;
    } | null;
    if (msg?.type !== "navigate" || typeof msg.path !== "string" || !matchCode)
      return;

    const path = msg.path.endsWith("/") ? msg.path.slice(0, -1) : msg.path;
    const adminPath = path.startsWith("/player/")
      ? path.replace("/player/", "/admin/")
      : path.startsWith("/admin/")
        ? path
        : null;
    if (!adminPath) return;

    if (adminPath.startsWith("/admin/vl")) return;

    const target = adminPath.endsWith(`/${matchCode}`)
      ? adminPath
      : `${adminPath}/${matchCode}`;
    if (location.pathname === target) return;

    navigate(target, { replace: true });
  }, [lastMessage, location.pathname, matchCode, navigate, sendMessage]);

  return null;
};

// Admin Layout wrapper for management pages
const AdminLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-black/20">
      <AdminHeader
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <div className="flex flex-1">
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

const AdminRoutes = () => {
  const location = useLocation();
  const stored = localStorage.getItem("matchCode") || "";
  const fromPath = (() => {
    try {
      const m = location.pathname.match(/OC3_[A-Za-z0-9_-]+/);
      return m ? m[0] : "";
    } catch {
      return "";
    }
  })();
  const matchCode = stored || fromPath;

  // Check if we're on a game control page (needs GameWebSocket)
  const isGamePage =
    location.pathname.includes("/waiting/") ||
    location.pathname.includes("/kdc/") ||
    location.pathname.includes("/kdr/") ||
    location.pathname.includes("/bp/") ||
    location.pathname.includes("/vdc/") ||
    location.pathname.includes("/vdr/") ||
    location.pathname.includes("/gm/");

  // Game control pages
  if (isGamePage) {
    return (
      <AuthGuard requiredRole="admin">
        <GameWebSocketProvider
          config={{
            role: "controller",
            matchCode,
          }}
        >
          <AdminAutoNavigator />
          <Routes>
            <Route path="/waiting/:matchCode" element={<WaitingPage />} />
            <Route path="/kdc/:matchCode?" element={<KhoiDongChungPage />} />
            <Route path="/kdr/:matchCode?" element={<KhoiDongRiengPage />} />
            <Route path="/bp/:matchCode?" element={<ButPhaPage />} />
            <Route
              path="/vdc/pick/:matchCode?"
              element={<VeDichPickPage round={VeDichRound.CHUNG} />}
            />
            <Route
              path="/vdr/pick/:matchCode?"
              element={<VeDichPickPage round={VeDichRound.RIENG} />}
            />
            <Route path="/vdc/:matchCode?" element={<VeDichChungPage />} />
            <Route path="/vdr/:matchCode?" element={<VeDichRiengPage />} />
            <Route path="/gm/:matchCode?" element={<GiaiMaPage />} />
          </Routes>
        </GameWebSocketProvider>
      </AuthGuard>
    );
  }

  // Management pages with AdminLayout
  return (
    <AuthGuard requiredRole="admin">
      <AdminLayout>
        <Routes>
          <Route
            path="/"
            element={
              <Navigate
                to={stored ? `/admin/waiting/${stored}` : "/admin/manage"}
                replace
              />
            }
          />
          <Route path="/manage" element={<AGameManagingPage />} />
          <Route path="/game-managing" element={<AGameManagingPage />} />
          {/* Tournament management routes */}
          <Route path="/tournaments" element={<TournamentListPage />} />
          <Route path="/tournaments/create" element={<TournamentFormPage />} />
          <Route path="/tournaments/:code" element={<TournamentDetailPage />} />
          <Route
            path="/tournaments/:code/edit"
            element={<TournamentFormPage />}
          />
        </Routes>
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminRoutes;
