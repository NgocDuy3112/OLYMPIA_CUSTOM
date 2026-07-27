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
    const token = sessionStorage.getItem("jwtToken_player");
    const storedPlayer = sessionStorage.getItem("playerCode");

    if (!token || !storedPlayer) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

const PlayerAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const playerCode = sessionStorage.getItem("playerCode") || "";
    const matchCode = sessionStorage.getItem("matchCode") || "";
    const { lastMessage } = usePlayerWebSocket();

    useEffect(() => {
        if (!lastMessage) return;

        const msg = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        const msgType = msg?.type ?? "";

        console.info("[PlayerAutoNavigator] Received message:", msgType, msg);

        if (msgType === "end_match" || msgType === "open_match" || msgType === "finish_match") {
            const target = `/player/waiting/${matchCode}`;
            if (location.pathname !== target) {
                console.info("[PlayerAutoNavigator] Navigating to waiting:", target);
                navigate(target, { replace: true });
            }
            return;
        }

        if (msgType !== "navigate") return;

        const basePath: unknown = msg?.path;
        if (typeof basePath !== "string") {
            console.warn("[PlayerAutoNavigator] No path in navigate message");
            return;
        }

        console.info("[PlayerAutoNavigator] Processing navigate message:", { basePath, matchCode, playerCode });

        const senderRole = (msg?.role ?? "") as string;
        const senderCode = (msg?.user_code ?? "") as string;
        if (senderRole !== "admin" && senderCode && senderCode !== playerCode) {
            console.warn("[PlayerAutoNavigator] Ignoring message from non-admin:", senderRole, senderCode);
            return;
        }

        if (!matchCode) {
            console.warn("[PlayerAutoNavigator] No matchCode, skipping navigation");
            return;
        }

        const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

        if (!normalized.startsWith("/player/")) {
            console.warn("[PlayerAutoNavigator] Ignoring non-player path:", normalized);
            return;
        }

        const isQualifier = normalized === "/player/vl";
        const target = isQualifier
            ? `${normalized}/OC3_M_VL`
            : `${normalized}/${matchCode}`;

        const currentPath = location.pathname.endsWith("/") ? location.pathname.slice(0, -1) : location.pathname;

        console.info("[PlayerAutoNavigator] Navigating:", { currentPath, target });
        if (currentPath !== target) {
            navigate(target, { replace: true });
        }

    }, [lastMessage, matchCode, playerCode, navigate, location.pathname]);

    return null;
};

const PlayerWebSocketWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
        try {
            if (location.pathname.startsWith("/player/vl")) {
                const defaultCode = "OC3_M_VL";
                sessionStorage.setItem("matchCode", defaultCode);
                setMatchCode(defaultCode);
            }
        } catch (e) {

        }
    }, [location.pathname, matchCode]);

    if (!matchCode) return <>{children}</>;

    return (
        <PlayerWebSocketProvider matchCode={matchCode}>
            <PlayerAutoNavigator />
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
                <Route path="/waiting/:matchCode" element={<PWaitingPage />} />
                <Route
                    path="/kdc/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PKhoiDongChungPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/kdr/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PKhoiDongRiengPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/bp/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PButPhaPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdc/pick/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichPickPage round={VeDichRound.CHUNG} />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdc/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichChungPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdr/pick/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PVeDichPickPage round={VeDichRound.RIENG} />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/vdr/:matchCode"
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
                    path="/vl/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PQualifierPage />
                        </ProtectedPlayerRoute>
                    }
                />
                <Route
                    path="/gm/:matchCode"
                    element={
                        <ProtectedPlayerRoute>
                            <PGiaiMaPage />
                        </ProtectedPlayerRoute>
                    }
                />
                {

}
                {

}
                {

}
                {

}
                {}
                <Route path="*" element={<Navigate to="/player/access" replace />} />
            </Routes>
        </PlayerWebSocketWrapper>
    );
};

export default PlayerRoutes;
