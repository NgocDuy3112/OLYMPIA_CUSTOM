import { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";


import PKhoiDongChungPage from "@/pages/player/PKhoiDongChungPage";
import PKhoiDongRiengPage from "@/pages/player/PKhoiDongRiengPage";



interface ProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedContestantRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
    const { playerCode } = useParams<{ playerCode: string }>();
    const token = sessionStorage.getItem("jwtToken_player");
    const storedPlayer = sessionStorage.getItem("playerCode");

    if (!token || !storedPlayer || (playerCode && playerCode !== storedPlayer)) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};



const ContestantAutoNavigator = () => {
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


const ContestantRoutes = () => {
    return (
        <>
            <ContestantAutoNavigator />
            <Routes>
            <Route path="/" element={<Navigate to="/contestant/waiting" replace />} />
            
            {/* <Route path="/access" element={<GameAccessPage />} />
            <Route path="/waiting/:matchCode/:playerCode" element={<WaitingPage />} /> */}
            <Route
                path="/kdc/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <PKhoiDongChungPage />
                    </ProtectedContestantRoute>
                }
            />
            <Route
                path="/kdr/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <PKhoiDongRiengPage />
                    </ProtectedContestantRoute>
                }
            />
            {/* <Route
                path="/vd/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <VuotDeoPage />
                    </ProtectedContestantRoute>
                }
            /> */}
            {/* <Route
                path="/bp/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <ButPhaPage />
                    </ProtectedContestantRoute>
                }
            /> */}
            {/* <Route
                path="/nrc/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <NuocRutChungPage />
                    </ProtectedContestantRoute>
                }
            /> */}
            {/* <Route
                path="/nrcn/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <NuocRutCaNhanPage />
                    </ProtectedContestantRoute>
                }
            /> */}
            {/* <Route
                path="/nrpick/:matchCode/:playerCode"
                element={
                    <ProtectedContestantRoute>
                        <NuocRutChonCauHoiPage />
                    </ProtectedContestantRoute>
                }
            /> */}
            {/* fallback */}
            <Route path="*" element={<Navigate to="/contestant/waiting" replace />} />
            </Routes>
        </>
    );
};

export default ContestantRoutes;
