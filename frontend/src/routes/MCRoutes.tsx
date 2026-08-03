import { useEffect } from "react";
import { useMatchCode } from "@/hooks/useMatchCode";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { MCWebSocketProvider } from "@/contexts/MCWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

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

const MCAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastMessage, sendMessage } = useGameWebSocket();
    const matchCode = localStorage.getItem("matchCode") || "";

    useEffect(() => {
        if (!lastMessage) return;
        const raw = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        const msg = (raw as any)?.message ?? raw;

        const msgType = msg?.type ?? "";

        if (msgType === "match_state") {
            const target = matchCode ? `/mc/waiting/${matchCode}` : "/mc/waiting";
            if (location.pathname !== target) {
                navigate(target, { replace: true });
            }
            return;
        }

        if (msgType !== "navigate") return;
        const basePath: unknown = msg?.path;
        if (typeof basePath !== "string") return;

        const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

        let mcPath: string | null = null;
        if (normalized.startsWith("/player/")) {
            mcPath = normalized.replace("/player/", "/mc/");
        } else if (normalized.startsWith("/mc/")) {
            mcPath = normalized;
        }
        if (!mcPath) return;

        const isQualifier = mcPath.startsWith("/mc/vl");
        const noParamsPaths = ["/mc/waiting"];
        const alreadyHasMatchCode = matchCode && mcPath.endsWith(`/${matchCode}`);
        const target = noParamsPaths.includes(mcPath) || alreadyHasMatchCode
            ? mcPath
            : isQualifier
                ? `${mcPath}/OC3_M_VL`
                : `${mcPath}/${matchCode}`;

        const currentPath = location.pathname.endsWith("/")
            ? location.pathname.slice(0, -1)
            : location.pathname;

        if (currentPath !== target) {
            navigate(target, { replace: true });
            void sendMessage({ type: "request_snapshot" });
        }
    }, [lastMessage, matchCode, navigate, location.pathname, sendMessage]);

    return null;
};

const MCWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const matchCode = useMatchCode({ defaultPath: "/mc/vl", defaultCode: "OC3_M_VL" });

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
                <Route path="/waiting/:matchCode" element={<MWaitingPage />} />
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
