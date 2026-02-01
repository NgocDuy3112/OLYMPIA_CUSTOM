import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";


import PKhoiDongChungPage from "@/pages/player/PKhoiDongChungPage";
import PKhoiDongRiengPage from "@/pages/player/PKhoiDongRiengPage";
import PButPhaPage from "@/pages/player/PButPhaPage";



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



const PlayerAutoNavigator = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const matchCode = sessionStorage.getItem("matchCode") || "";
    const playerCode = sessionStorage.getItem("playerCode") || "";

    const { lastMessage } = useWebSocket(matchCode);

    useEffect(() => {
        if (!lastMessage) return;

        const msg = typeof lastMessage === "string" ? JSON.parse(lastMessage) : lastMessage;
        if (msg?.type !== "navigate") return;

        const basePath: unknown = msg?.path;
        if (typeof basePath !== "string") return;
        if (!matchCode || !playerCode) return;

        const normalized = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
        const target = `${normalized}/${matchCode}/${playerCode}`;

        if (location.pathname !== target) {
            navigate(target, { replace: true });
        }
    }, [lastMessage, matchCode, playerCode, navigate, location.pathname]);

    return null;
};


const PlayerRoutes = () => {
    return (
        <>
            <PlayerAutoNavigator />
                <Routes>
                <Route path="/" element={<Navigate to="/player/waiting" replace />} />
                
                {/* <Route path="/access" element={<GameAccessPage />} />
                <Route path="/waiting/:matchCode/:playerCode" element={<WaitingPage />} /> */}
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
                <Route path="*" element={<Navigate to="/player/waiting" replace />} />
            </Routes>
        </>
    );
};

export default PlayerRoutes;
