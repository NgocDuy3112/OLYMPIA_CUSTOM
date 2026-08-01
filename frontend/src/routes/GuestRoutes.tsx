import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { GuestWebSocketProvider } from "@/contexts/GuestWebSocketContext";
import { useGuestWebSocket } from "@/hooks/useGuestWebSocket";

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
    const { lastMessage } = useGuestWebSocket();
    const matchCode = localStorage.getItem("matchCode") || "";

    useEffect(() => {
        if (!lastMessage) return;
        const raw = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        const msg = (raw as any)?.message ?? raw;

        const msgType = msg?.type ?? "";

        if (msgType === "end_match" || msgType === "open_match" || msgType === "finish_match") {
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
    const { matchCode: urlMatchCode } = useParams<{ matchCode: string }>();
    const location = useLocation();
    const [matchCode, setMatchCode] = useState<string>(() => {
        const s = localStorage.getItem("matchCode");
        return s && s.trim() !== "" ? s : "";
    });

    useEffect(() => {
        if (urlMatchCode && urlMatchCode !== matchCode) {
            localStorage.setItem("matchCode", urlMatchCode);
            setMatchCode(urlMatchCode);
        }
    }, [urlMatchCode, matchCode]);

    useEffect(() => {
        if (matchCode) return;
        const onMatchCodeSet = () => {
            const s = localStorage.getItem("matchCode") || "";
            if (s && s.trim() !== "") setMatchCode(s);
        };
        window.addEventListener("oc3_matchCode_set", onMatchCodeSet);
        return () => window.removeEventListener("oc3_matchCode_set", onMatchCodeSet);
    }, [matchCode]);

    useEffect(() => {
        if (matchCode) return;
        if (location.pathname.startsWith("/guest/vl")) {
            const defaultCode = "OC3_M_VL";
            localStorage.setItem("matchCode", defaultCode);
            setMatchCode(defaultCode);
        }
    }, [location.pathname, matchCode]);

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