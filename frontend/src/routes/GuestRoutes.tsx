import { useEffect } from "react";
import { useMatchCode } from "@/hooks/useMatchCode";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { GuestWebSocketProvider } from "@/contexts/GuestWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

import GKhoiDongChungPage from "@/pages/guest/GKhoiDongChungPage";
import GKhoiDongRiengPage from "@/pages/guest/GKhoiDongRiengPage";
import GButPhaPage from "@/pages/guest/GButPhaPage";
import GVeDichChungPage from "@/pages/guest/GVeDichChungPage";
import GVeDichRiengPage from "@/pages/guest/GVeDichRiengPage";
import GVeDichPickPage from "@/pages/guest/GVeDichPickPage";
import GGiaiMaPage from "@/pages/guest/GGiaiMaPage";
import GQualifierPage from "@/pages/guest/GQualifierPage";
import GGameAccessPage from "@/pages/guest/GGameAccessPage";
import GWaitingPage from "@/pages/guest/GWaitingPage";
import { VeDichRound } from "@/types/veDich";

const ProtectedGuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const token = sessionStorage.getItem("jwtToken_guest");
    if (!token ) {
        return <Navigate to="/guest/access" replace />;
    }
    return <>{children}</>;
};

const GuestAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastMessage } = useGameWebSocket();
    const matchCode = localStorage.getItem("matchCode") || "";

    useEffect(() => {
        if (!lastMessage) return;
        const raw = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        const msg = (raw as any)?.message ?? raw;

        const msgType = msg?.type ?? "";

        if (msgType === "match_state") {
            const target = matchCode ? `/guest/waiting/${matchCode}` : "/guest/waiting";
            if (location.pathname !== target) {
                navigate(target, { replace: true });
            }
            return;
        }

        if (msgType !== "navigate") return;
        const basePath: unknown = msg?.path;
        if (typeof basePath !== "string") return;

        const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

        let guestPath: string | null = null;
        if (normalized.startsWith("/player/")) {
            guestPath = normalized.replace("/player/", "/guest/");
        } else if (normalized.startsWith("/mc/")) {
            guestPath = normalized.replace("/mc/", "/guest/");
        } else if (normalized.startsWith("/guest/")) {
            guestPath = normalized;
        }
        if (!guestPath) return;

        const isQualifier = guestPath.startsWith("/guest/vl");
        const noParamsPaths = ["/guest/waiting"];
        const alreadyHasMatchCode = matchCode && guestPath.endsWith(`/${matchCode}`);
        const target = noParamsPaths.includes(guestPath) || alreadyHasMatchCode
            ? guestPath
            : isQualifier
                ? `${guestPath}/OC3_M_VL`
                : `${guestPath}/${matchCode}`;

        const currentPath = location.pathname.endsWith("/")
            ? location.pathname.slice(0, -1)
            : location.pathname;

        if (currentPath !== target) {
            navigate(target, { replace: true });
        }
    }, [lastMessage, matchCode, navigate, location.pathname]);

    return null;
};

const GuestWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const matchCode = useMatchCode({ defaultPath: "/guest/vl", defaultCode: "OC3_M_VL" });

    if (!matchCode) return <>{children}</>;

    return (
        <GuestWebSocketProvider matchCode={matchCode}>
            <GuestAutoNavigator />
            {children}
        </GuestWebSocketProvider>
    );
};

const GuestRoutes = () => {
    return (
        <GuestWebSocketWrapper>
            <Routes>
                <Route path="/" element={<Navigate to="/guest/access" replace />} />
                <Route path="/access" element={<GGameAccessPage />} />
                <Route path="/waiting" element={<GWaitingPage />} />
                <Route path="/waiting/:matchCode" element={<GWaitingPage />} />
                <Route
                    path="/kdc/:matchCode"
                    element={<ProtectedGuestRoute><GKhoiDongChungPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/kdr/:matchCode"
                    element={<ProtectedGuestRoute><GKhoiDongRiengPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/bp/:matchCode"
                    element={<ProtectedGuestRoute><GButPhaPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/gm/:matchCode"
                    element={<ProtectedGuestRoute><GGiaiMaPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/vl/:matchCode"
                    element={<ProtectedGuestRoute><GQualifierPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/vl"
                    element={<ProtectedGuestRoute><GQualifierPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/vdc/pick/:matchCode"
                    element={<ProtectedGuestRoute><GVeDichPickPage round={VeDichRound.CHUNG} /></ProtectedGuestRoute>}
                />
                <Route
                    path="/vdc/:matchCode"
                    element={<ProtectedGuestRoute><GVeDichChungPage /></ProtectedGuestRoute>}
                />
                <Route
                    path="/vdr/pick/:matchCode"
                    element={<ProtectedGuestRoute><GVeDichPickPage round={VeDichRound.RIENG} /></ProtectedGuestRoute>}
                />
                <Route
                    path="/vdr/:matchCode"
                    element={<ProtectedGuestRoute><GVeDichRiengPage /></ProtectedGuestRoute>}
                />
                <Route path="*" element={<Navigate to="/guest/access" replace />} />
            </Routes>
        </GuestWebSocketWrapper>
    );
};

export default GuestRoutes;