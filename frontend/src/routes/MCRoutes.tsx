import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { MCWebSocketProvider } from "@/contexts/MCWebSocketContext";
import { useMcWebSocket } from "@/hooks/useMcWebSocket";

import MGameAccessPage from "@/pages/mc/MGameAccessPage";
import MWaitingPage from "@/pages/mc/MWaitingPage";
import MKhoiDongChungPage from "@/pages/mc/MKhoiDongChungPage";
import MKhoiDongRiengPage from "@/pages/mc/MKhoiDongRiengPage";
import MButPhaPage from "@/pages/mc/MButPhaPage";
import MGiaiMaPage from "@/pages/mc/MGiaiMaPage";
import MQualifierPage from "@/pages/mc/MQualifierPage";
import MVeDichChungPage from "@/pages/mc/MVeDichChungPage";
import MVeDichRiengPage from "@/pages/mc/MVeDichRiengPage";
import MVeDichPickPage from "@/pages/mc/MVeDichPickPage";
import { VeDichRound } from "@/types/veDich";

const ProtectedMcRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const token = sessionStorage.getItem("jwtToken_mc");
    const role = sessionStorage.getItem("role");
    if (!token || role !== "mc") {
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

// Auto-navigator: listens for admin navigate messages and redirects MC to corresponding page
const MCAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastMessage } = useMcWebSocket();
    const matchCode = sessionStorage.getItem("matchCode") || "";

    useEffect(() => {
        if (!lastMessage) return;
        const raw = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        const msg = (raw as any)?.message ?? raw;

        if (msg?.type !== "navigate") return;
        const basePath: unknown = msg?.path;
        if (typeof basePath !== "string") return;

        const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

        // Map /player/X → /mc/X
        const mcPath = normalized.startsWith("/player/")
            ? normalized.replace("/player/", "/mc/")
            : null;
        if (!mcPath) return;

        const noParamsPaths = ["/mc/waiting"];
        const target = noParamsPaths.includes(mcPath)
            ? mcPath
            : `${mcPath}/${matchCode}`;

        const currentPath = location.pathname.endsWith("/")
            ? location.pathname.slice(0, -1)
            : location.pathname;

        if (currentPath !== target) {
            navigate(target, { replace: true });
        }
    }, [lastMessage, matchCode, navigate, location.pathname]);

    return null;
};

const MCWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [matchCode, setMatchCode] = useState<string>(() => {
        const s = sessionStorage.getItem("matchCode");
        return s && s.trim() !== "" ? s : "";
    });
    const location = useLocation();

    useEffect(() => {
        if (matchCode) return;
        const onMatchCodeSet = () => {
            const s = sessionStorage.getItem("matchCode") || "";
            if (s && s.trim() !== "") setMatchCode(s);
        };
        window.addEventListener("oc3_matchCode_set", onMatchCodeSet);
        return () => window.removeEventListener("oc3_matchCode_set", onMatchCodeSet);
    }, [matchCode]);

    useEffect(() => {
        if (matchCode) return;
        if (location.pathname.startsWith("/mc/vl")) {
            const defaultCode = "OC3_M_VL";
            sessionStorage.setItem("matchCode", defaultCode);
            setMatchCode(defaultCode);
        }
    }, [location.pathname, matchCode]);

    if (!matchCode) return <>{children}</>;

    return (
        <MCWebSocketProvider matchCode={matchCode}>
            <MCAutoNavigator />
            {children}
        </MCWebSocketProvider>
    );
};

const MCRoutes = () => {
    return (
        <MCWebSocketWrapper>
            <Routes>
                <Route path="/" element={<Navigate to="/mc/access" replace />} />
                <Route path="/access" element={<MGameAccessPage />} />
                <Route path="/waiting" element={<MWaitingPage />} />
                <Route
                    path="/kdc/:matchCode"
                    element={<ProtectedMcRoute><MKhoiDongChungPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/kdr/:matchCode"
                    element={<ProtectedMcRoute><MKhoiDongRiengPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/bp/:matchCode"
                    element={<ProtectedMcRoute><MButPhaPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/gm/:matchCode"
                    element={<ProtectedMcRoute><MGiaiMaPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/vl/:matchCode"
                    element={<ProtectedMcRoute><MQualifierPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/vl"
                    element={<ProtectedMcRoute><MQualifierPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/vdc/pick/:matchCode"
                    element={<ProtectedMcRoute><MVeDichPickPage round={VeDichRound.CHUNG} /></ProtectedMcRoute>}
                />
                <Route
                    path="/vdc/:matchCode"
                    element={<ProtectedMcRoute><MVeDichChungPage /></ProtectedMcRoute>}
                />
                <Route
                    path="/vdr/pick/:matchCode"
                    element={<ProtectedMcRoute><MVeDichPickPage round={VeDichRound.RIENG} /></ProtectedMcRoute>}
                />
                <Route
                    path="/vdr/:matchCode"
                    element={<ProtectedMcRoute><MVeDichRiengPage /></ProtectedMcRoute>}
                />
                <Route path="*" element={<Navigate to="/mc/access" replace />} />
            </Routes>
        </MCWebSocketWrapper>
    );
};

export default MCRoutes;
