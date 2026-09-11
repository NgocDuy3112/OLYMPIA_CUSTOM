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
import { useWsMessage } from "@/hooks/useWsMessage";
import { AuthGuard } from "@/components/auth/AuthGuard";

import ButPhaPage from "@/pages/game/ButPhaPage";
import KhoiDongChungPage from "@/pages/game/KhoiDongChungPage";
import KhoiDongRiengPage from "@/pages/game/KhoiDongRiengPage";
import GiaiMaPage from "@/pages/game/GiaiMaPage";
import VeDichChungPage from "@/pages/game/VeDichChungPage";
import VeDichRiengPage from "@/pages/game/VeDichRiengPage";
import WaitingPage from "@/pages/game/WaitingPage";
import VeDichPickPage from "@/pages/game/VeDichPickPage";
import MGameAccessPage from "@/pages/mc/MGameAccessPage";
import { VeDichRound } from "@/types/veDich";

const MCAutoNavigator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const matchCode = localStorage.getItem("matchCode") || "";
  const message = useWsMessage("match_state", "navigate");
  useEffect(() => {
    if (!message) return;

    const msgType = message.type;

    if (msgType === "match_state") {
      const target = matchCode ? `/mc/waiting/${matchCode}` : "/mc/waiting";
      if (location.pathname !== target) {
        navigate(target, { replace: true });
      }
      return;
    }

    const basePath: unknown = message.path;
    if (typeof basePath !== "string") return;

    const normalized = basePath.endsWith("/")
      ? basePath.slice(0, -1)
      : basePath;

    let mcPath: string | null = null;
    if (normalized.startsWith("/player/")) {
      mcPath = normalized.replace("/player/", "/mc/");
    } else if (normalized.startsWith("/mc/")) {
      mcPath = normalized;
    }
    if (!mcPath) return;

    const noParamsPaths = ["/mc/waiting"];
    const alreadyHasMatchCode = matchCode && mcPath.endsWith(`/${matchCode}`);
    const target =
      noParamsPaths.includes(mcPath) || alreadyHasMatchCode
        ? mcPath
        : `${mcPath}/${matchCode}`;

    const currentPath = location.pathname.endsWith("/")
      ? location.pathname.slice(0, -1)
      : location.pathname;

    if (currentPath !== target) {
      navigate(target, { replace: true });
    }
  }, [message, matchCode, navigate, location.pathname]);

  return null;
};

const MCWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const matchCode = useMatchCode({
    defaultPath: "/mc/waiting",
    defaultCode: "",
  });

  if (!matchCode) return <>{children}</>;

  return (
    <GameWebSocketProvider
      config={{
        role: "mc",
        matchCode,
      }}
    >
      <MCAutoNavigator />
      {children}
    </GameWebSocketProvider>
  );
};

const MCRoutes = () => {
  return (
    <AuthGuard>
      <MCWebSocketWrapper>
        <Routes>
          <Route path="/" element={<Navigate to="/mc/access" replace />} />
          <Route path="/access" element={<MGameAccessPage />} />
          <Route path="/waiting" element={<WaitingPage />} />
          <Route path="/waiting/:matchCode" element={<WaitingPage />} />
          <Route path="/kdc/:matchCode" element={<KhoiDongChungPage />} />
          <Route path="/kdr/:matchCode" element={<KhoiDongRiengPage />} />
          <Route path="/bp/:matchCode" element={<ButPhaPage />} />
          <Route path="/gm/:matchCode" element={<GiaiMaPage />} />
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
          <Route path="*" element={<Navigate to="/mc/access" replace />} />
        </Routes>
      </MCWebSocketWrapper>
    </AuthGuard>
  );
};

export default MCRoutes;
