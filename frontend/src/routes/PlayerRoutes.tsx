import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { PlayerWebSocketProvider } from "@/contexts/PlayerWebSocketContext";
import { usePlayerWebSocket } from "@/hooks/usePlayerWebSocket";


import PKhoiDongChungPage from "@/pages/player/PKhoiDongChungPage";
import PKhoiDongRiengPage from "@/pages/player/PKhoiDongRiengPage";
import PButPhaPage from "@/pages/player/PButPhaPage";
import PVeDichChungPage from "@/pages/player/PVeDichChungPage";
import PVeDichRiengPage from "@/pages/player/PVeDichRiengPage";
import PVeDichPickPage from "@/pages/player/PVeDichPickPage";
import PGiaiMaPage from "@/pages/player/PGiaiMaPage";
import PQualifierPage from "@/pages/player/PQualifierPage";
import PGameAccessPage from "@/pages/player/PGameAccessPage";
import PWaitingPage from "@/pages/player/PWaitingPage";
import { VeDichRound } from "@/types/veDich";



interface PProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedPlayerRoute: React.FC<PProtectedRouteProps> = ({ children }) => {
    const { playerCode } = useParams<{ playerCode: string }>();
    const token = sessionStorage.getItem("jwtToken_player");
    const storedPlayer = sessionStorage.getItem("playerCode");

    if (!token || !storedPlayer || (playerCode && playerCode !== storedPlayer)) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};



// Component to conditionally render WebSocket provider only when matchCode is available
const PlayerWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Track matchCode in state so we can react to it being set during the same page session
    const [matchCode, setMatchCode] = useState<string>(() => {
        const s = sessionStorage.getItem("matchCode");
        return s && s.trim() !== "" ? s : "";
    });
    const location = useLocation();
    // Listen for a custom event that signals matchCode was set by the access page.
    // This useEffect must be called unconditionally to satisfy the rules-of-hooks.
    useEffect(() => {
        if (matchCode) return; // already have matchCode, nothing to do

        const onMatchCodeSet = () => {
            const s = sessionStorage.getItem("matchCode") || "";
            if (s && s.trim() !== "") setMatchCode(s);
        };

        window.addEventListener("oc3_matchCode_set", onMatchCodeSet);
        return () => window.removeEventListener("oc3_matchCode_set", onMatchCodeSet);
    }, [matchCode]);

    // If user visits the qualifier player route and no matchCode is set, default to OC3_Q
    useEffect(() => {
        if (matchCode) return;
        try {
            if (location.pathname.startsWith("/player/vl")) {
                const defaultCode = "OC3_Q";
                sessionStorage.setItem("matchCode", defaultCode);
                setMatchCode(defaultCode);
            }
        } catch (e) {
            // ignore
        }
    }, [location.pathname, matchCode]);

    // If matchCode is not set yet, render children without WebSocket provider
    if (!matchCode) return <>{children}</>;

    // AutoNavigator component that uses WebSocket - only rendered inside provider
    const PlayerAutoNavigatorWithWs: React.FC = () => {
        const navigate = useNavigate();
        const location = useLocation();
        const playerCode = sessionStorage.getItem("playerCode") || "";
        const { lastMessage } = usePlayerWebSocket();

        useEffect(() => {
            if (!lastMessage) return;
            const raw = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
            const msg = raw?.message ?? raw;

            // Debugging: log the incoming message and routing context so we can trace why navigation may be skipped
            console.info("[AutoNav] received WS message:", { raw, msg, matchCode, playerCode, pathname: location.pathname });

            if (msg?.type !== "navigate") return;

            const basePath: unknown = msg?.path;
            if (typeof basePath !== "string") return;

            // If message targets a specific user, respect it (empty string means broadcast)
            const targetUser = (msg?.user_code ?? "") as string;
            if (targetUser && targetUser !== playerCode) {
                // message is for some other player
                console.debug("[AutoNav] navigate message for different user, ignoring", { targetUser, playerCode });
                return;
            }

            if (!matchCode || !playerCode) {
                console.warn("[AutoNav] missing matchCode or playerCode, cannot navigate", { matchCode, playerCode });
                return;
            }

            const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

            // Some admin paths are full player routes (no match/player params expected)
            // — e.g. "/player/waiting" should navigate exactly to that path.
            const noParamsPaths: string[] = ["/player/waiting", "/player/vl"];

            const target = noParamsPaths.includes(normalized)
                ? normalized
                : `${normalized}/${matchCode}/${playerCode}`;

            // Normalize trailing slash when comparing current location
            const currentPath = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;

            if (currentPath !== target) {
                console.info("[AutoNav] navigating to", target, "from", location.pathname);
                navigate(target, { replace: true });
            }
        }, [lastMessage, playerCode, navigate, location.pathname]);

        return null;
    };

    return (
        <PlayerWebSocketProvider matchCode={matchCode}>
            <PlayerAutoNavigatorWithWs />
            {children}
        </PlayerWebSocketProvider>
    );
};


const PlayerRoutes = () => {
    return (
        <PlayerWebSocketWrapper>
            <Routes>
                <Route path="/" element={<Navigate to="/player/access" replace />} />
                
                <Route path="/access" element={<PGameAccessPage />} />
                <Route path="/waiting" element={<PWaitingPage />} />
                <Route
                    path="/kdc/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PKhoiDongChungPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/kdr/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PKhoiDongRiengPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/bp/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PButPhaPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdc/pick/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichPickPage round={VeDichRound.CHUNG} />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdc/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichChungPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdr/pick/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichPickPage round={VeDichRound.RIENG} />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdr/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichRiengPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vl"
                    element={
                        <ProtectedPlayerRoute>
                            <PQualifierPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/gm/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PGiaiMaPage />
                        </ProtectedPlayerRoute>
                    }
                />
                {/* <Route
                    path="/vd/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <VuotDeoPage />
                        </ProtectedPlayerRoute>
                    }
                /> */}
                {/* <Route
                    path="/nrc/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <NuocRutChungPage />
                        </ProtectedPlayerRoute>
                    }
                /> */}
                {/* <Route
                    path="/nrcn/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <NuocRutCaNhanPage />
                        </ProtectedPlayerRoute>
                    }
                /> */}
                {/* <Route
                    path="/nrpick/:matchCode/:playerCode"
                    element={
                        <ProtectedPlayerRoute>
                            <NuocRutChonCauHoiPage />
                        </ProtectedPlayerRoute>
                    }
                /> */}
                {/* fallback */}
                <Route path="*" element={<Navigate to="/player/access" replace />} />
            </Routes>
        </PlayerWebSocketWrapper>
    );
};

export default PlayerRoutes;
