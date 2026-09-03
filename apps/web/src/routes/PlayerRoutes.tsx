import { useEffect } from "react";
import { useMatchCode } from "@/hooks/useMatchCode";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { GameWebSocketProvider } from "@/contexts/GameWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { AuthGuard } from "@/components/auth/AuthGuard";

import ButPhaPage from "@/pages/game/ButPhaPage";
import KhoiDongChungPage from "@/pages/game/KhoiDongChungPage";
import KhoiDongRiengPage from "@/pages/game/KhoiDongRiengPage";
import GiaiMaPage from "@/pages/game/GiaiMaPage";
import VeDichChungPage from "@/pages/game/VeDichChungPage";
import VeDichRiengPage from "@/pages/game/VeDichRiengPage";
import WaitingPage from "@/pages/game/WaitingPage";
import VeDichPickPage from "@/pages/game/VeDichPickPage";
import PGameAccessPage from "@/pages/player/PGameAccessPage";
import { VeDichRound } from "@/types/veDich";

const PlayerAutoNavigator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const playerCode = sessionStorage.getItem("playerCode") || "";
  const matchCode = localStorage.getItem("matchCode") || "";
  const { lastMessage, sendMessage } = useGameWebSocket();
  useEffect(() => {
    if (!lastMessage) return;

    const msg =
      typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
    const msgType = msg?.type ?? "";

    if (msgType === "match_state") {
      const target = `/player/waiting/${matchCode}`;
      if (location.pathname !== target) {
        navigate(target, { replace: true });
      }
      return;
    }

    if (msgType !== "navigate") return;

    const basePath: unknown = msg?.path;
    if (typeof basePath !== "string") return;

    const senderRole = (msg?.role ?? "") as string;
    const senderCode = (msg?.user_code ?? "") as string;
    if (senderRole !== "admin" && senderCode && senderCode !== playerCode)
      return;

    if (!matchCode) return;

    const normalized = basePath.endsWith("/")
      ? basePath.slice(0, -1)
      : basePath;

    if (!normalized.startsWith("/player/")) return;

    const alreadyHasMatchCode =
      matchCode && normalized.endsWith(`/${matchCode}`);
    const target = alreadyHasMatchCode
      ? normalized
      : `${normalized}/${matchCode}`;

    const currentPath = location.pathname.endsWith("/")
      ? location.pathname.slice(0, -1)
      : location.pathname;

    if (currentPath !== target) {
      navigate(target, { replace: true });
    }
  }, [
    lastMessage,
    matchCode,
    playerCode,
    navigate,
    location.pathname,
    sendMessage,
  ]);

  return null;
};

const PlayerWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const matchCode = useMatchCode({
    defaultPath: "/player/waiting",
    defaultCode: "",
  });

  if (!matchCode) return <>{children}</>;

  return (
    <GameWebSocketProvider
      config={{
        role: "player",
        matchCode,
        userCode: sessionStorage.getItem("playerCode") || undefined,
      }}
    >
      <PlayerAutoNavigator />
      {children}
    </GameWebSocketProvider>
  );
};

const PlayerRoutes = () => {
  return (
    <AuthGuard>
      <PlayerWebSocketWrapper>
        <Routes>
          <Route path="/" element={<Navigate to="/player/access" replace />} />
          <Route path="/access" element={<PGameAccessPage />} />
          <Route path="/waiting/:matchCode" element={<WaitingPage />} />
          <Route path="/kdc/:matchCode" element={<KhoiDongChungPage />} />
          <Route path="/kdr/:matchCode" element={<KhoiDongRiengPage />} />
          <Route path="/bp/:matchCode" element={<ButPhaPage />} />
          <Route
            path="/vdc/pick/:matchCode"
            element={<VeDichPickPage round={VeDichRound.CHUNG} />}
          />
          <Route path="/vdc/:matchCode" element={<VeDichChungPage />} />
          <Route
            path="/vdr/pick/:matchCode"
            element={<VeDichPickPage round={VeDichRound.RIENG} />}
          />
          <Route path="/vdr/:matchCode" element={<VeDichRiengPage />} />
          <Route
            path="/vl"
            element={<Navigate to="/player/access" replace />}
          />
          <Route
            path="/vl/:matchCode"
            element={<Navigate to="/player/access" replace />}
          />
          <Route path="/gm/:matchCode" element={<GiaiMaPage />} />
          <Route path="*" element={<Navigate to="/player/access" replace />} />
        </Routes>
      </PlayerWebSocketWrapper>
    </AuthGuard>
  );
};

export default PlayerRoutes;
