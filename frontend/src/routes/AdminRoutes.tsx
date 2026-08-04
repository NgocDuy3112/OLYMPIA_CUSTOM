import { useEffect } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";

import AKhoiDongChungPage from "@/pages/admin/AKhoiDongChungPage";
import AKhoiDongRiengPage from "@/pages/admin/AKhoiDongRiengPage";
import AButPhaPage from "@/pages/admin/AButPhaPage";
import AVeDichPickQuestion from "@/pages/admin/AVeDichPickQuestionPage";
import AVeDichChungPage from "@/pages/admin/AVeDichChungPage";
import AVeDichRiengPage from "@/pages/admin/AVeDichRiengPage";
import AGiaiMaPage from "@/pages/admin/AGiaiMaPage";
import AQualifierPage from "@/pages/admin/AQualifierPage";
import AGameManagingPage from "@/pages/admin/AGameManagingPage";
import AWaitingPage from "@/pages/admin/AWaitingPage";
import { AdminWebSocketProvider } from "@/contexts/AdminWebSocketContext";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";

interface AProtectedRouteProps {
    children: React.ReactNode;
}

export const ProtectedAdminRoute: React.FC<AProtectedRouteProps> = ({ children }) => {
    const token = localStorage.getItem("jwtToken_admin");
    const role = localStorage.getItem("role");

    if (!token || role !== "admin") {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}

const QUALIFIER_MATCH_CODE = "OC3_M_VL";

const AdminAutoNavigator: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { lastMessage, sendMessage } = useGameWebSocket();
    const matchCode = localStorage.getItem("matchCode") || "";

    useEffect(() => {
        const msg = (lastMessage?.message ?? lastMessage) as { type?: string; path?: unknown } | null;
        if (msg?.type !== "navigate" || typeof msg.path !== "string" || !matchCode) return;

        const path = msg.path.endsWith("/") ? msg.path.slice(0, -1) : msg.path;
        const adminPath = path.startsWith("/player/")
            ? path.replace("/player/", "/admin/")
            : path.startsWith("/admin/")
                ? path
                : null;
        if (!adminPath) return;

        const target = adminPath.endsWith(`/${matchCode}`) ? adminPath : `${adminPath}/${matchCode}`;
        if (location.pathname === target) return;

        navigate(target, { replace: true });
        void sendMessage({ type: "request_snapshot" });
    }, [lastMessage, location.pathname, matchCode, navigate, sendMessage]);

    return null;
};

const AdminRoutes = () => {

    const location = useLocation();

    const isQualifierRoute = location.pathname === "/admin/vl";

    const stored = localStorage.getItem("matchCode") || "";
    const fromPath = (() => {
        try {
            const m = location.pathname.match(/OC3_[A-Za-z0-9_-]+/);
            return m ? m[0] : "";
        } catch {
            return "";
        }
    })();
    const matchCode = isQualifierRoute ? QUALIFIER_MATCH_CODE : (stored || fromPath);

    return (
        <AdminWebSocketProvider matchCode={matchCode}>
            <AdminAutoNavigator />
            <Routes>
            <Route path="/" element={
                <Navigate to={stored ? `/admin/waiting/${stored}` : "/admin/manage"} replace />
            } />
            <Route
                path="/waiting/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AWaitingPage />
                    </ProtectedAdminRoute>
                }
            />
            {}
            <Route
                path="/kdc/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongChungPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/kdr/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongRiengPage />
                    </ProtectedAdminRoute>
                }
            />
            {}
            <Route
                path="/bp/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AButPhaPage />
                    </ProtectedAdminRoute>
                }
            />
            {}
            <Route
                path="/vdc/pick/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichPickQuestion />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/vdr/pick/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichPickQuestion />
                    </ProtectedAdminRoute>
                }
            />
            {}
            <Route
                path="/vdc/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichChungPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/vdr/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichRiengPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/vl"
                element={
                    <ProtectedAdminRoute>
                        <AQualifierPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/gm/:matchCode?"
                element={
                    <ProtectedAdminRoute>
                        <AGiaiMaPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/game-managing"
                element={
                    <ProtectedAdminRoute>
                        <AGameManagingPage />
                    </ProtectedAdminRoute>
                }
            />
            </Routes>
        </AdminWebSocketProvider>
    );
}

export default AdminRoutes;