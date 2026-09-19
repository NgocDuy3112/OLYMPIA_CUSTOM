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
import ControllerOverviewPage from "@/pages/controller/ControllerOverviewPage";
import { GameWebSocketProvider } from "@/contexts/GameWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { ControllerHeader, ControllerSidebar } from "@/components/layout";
import { getMatchCode } from "@/utils/storage";
import { VeDichRound } from "@/types/veDich";

const ControllerAutoNavigator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { lastMessage, sendMessage } = useGameWebSocket();
  const matchCode = getMatchCode();
  useEffect(() => {
    const msg = (lastMessage?.message ?? lastMessage) as {
      type?: string;
      path?: unknown;
    } | null;
    if (msg?.type !== "navigate" || typeof msg.path !== "string" || !matchCode)
      return;

    const path = msg.path.endsWith("/") ? msg.path.slice(0, -1) : msg.path;
    // Controller shell owns /controller/*; map legacy /player/ and /admin/
    // paths to controller paths so old broadcasts keep working.
    const controllerPath = path.startsWith("/player/")
      ? path.replace("/player/", "/controller/")
      : path.startsWith("/admin/")
        ? path.replace("/admin/", "/controller/")
        : path.startsWith("/controller/")
          ? path
          : null;
    if (!controllerPath) return;

    const target = controllerPath.endsWith(`/${matchCode}`)
      ? controllerPath
      : `${controllerPath}/${matchCode}`;
    if (location.pathname === target) return;

    navigate(target, { replace: true });
  }, [lastMessage, location.pathname, matchCode, navigate, sendMessage]);

  return null;
};

const ControllerLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-black/20">
      <ControllerHeader
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <div className="flex flex-1">
        <ControllerSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

const ControllerRoutes = () => {
  const stored = getMatchCode();
  const fromPath = (() => {
    try {
      const m = window.location.pathname.match(/OC3_[A-Za-z0-9_-]+/);
      return m ? m[0] : "";
    } catch {
      return "";
    }
  })();
  const matchCode = stored || fromPath;

  return (
    <AuthGuard requiredRole="operator" requiredScope="controller">
      <ControllerLayout>
        <GameWebSocketProvider
          config={{
            role: "controller",
            matchCode,
          }}
        >
          <ControllerAutoNavigator />
          <Routes>
            <Route
              path="/"
              element={<Navigate to="/controller/overview" replace />}
            />
            <Route path="/overview" element={<ControllerOverviewPage />} />
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
            <Route path="*" element={<Navigate to="/controller/overview" replace />} />
          </Routes>
        </GameWebSocketProvider>
      </ControllerLayout>
    </AuthGuard>
  );
};

export default ControllerRoutes;
