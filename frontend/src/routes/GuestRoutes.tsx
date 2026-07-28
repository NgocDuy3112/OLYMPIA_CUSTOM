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

const GuestAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastMessage } = useGuestWebSocket();
    const matchCode = sessionStorage.getItem("matchCode") || "";

    useEffect(() => {
        if (!lastMessage) return;
        const raw = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        const msg = (raw as any)?.message ?? raw;

        const msgType = msg?.type ?? "";

        if (msgType === "end_match" || msgType === "open_match" || msgType === "finish_match") {
            const target = "/guest/waiting";
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

        const isQualifier = guestPath === "/guest/vl";
        const noParamsPaths = ["/guest/waiting"];
        const target = noParamsPaths.includes(guestPath)
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
        const s = sessionStorage.getItem("matchCode");
        return s && s.trim() !== "" ? s : "";
    });

    useEffect(() => {
        if (urlMatchCode && urlMatchCode !== matchCode) {
            sessionStorage.setItem("matchCode", urlMatchCode);
            setMatchCode(urlMatchCode);
        }
    }, [urlMatchCode, matchCode]);

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
        if (location.pathname.startsWith("/guest/vl")) {
            const defaultCode = "OC3_M_VL";
            sessionStorage.setItem("matchCode", defaultCode);
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
                <Route path="/kdc/:matchCode" element={<GKhoiDongChungPage />} />
                <Route path="/kdr/:matchCode" element={<GKhoiDongRiengPage />} />
                <Route path="/bp/:matchCode" element={<GButPhaPage />} />
                <Route path="/gm/:matchCode" element={<GGiaiMaPage />} />
                <Route path="/vl/:matchCode" element={<GQualifierPage />} />
                <Route path="/vl" element={<GQualifierPage />} />
                <Route path="/vdc/pick/:matchCode" element={<GVeDichPickPage round={VeDichRound.CHUNG} />} />
                <Route path="/vdc/:matchCode" element={<GVeDichChungPage />} />
                <Route path="/vdr/pick/:matchCode" element={<GVeDichPickPage round={VeDichRound.RIENG} />} />
                <Route path="/vdr/:matchCode" element={<GVeDichRiengPage />} />
                <Route path="*" element={<Navigate to="/guest/access" replace />} />
            </Routes>
        </GuestWebSocketWrapper>
    );
};

export default GuestRoutes;