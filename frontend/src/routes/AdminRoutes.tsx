import { Routes, Route, Navigate, useLocation } from "react-router-dom";

import AKhoiDongChungPage from "@/pages/admin/AKhoiDongChungPage";
import AKhoiDongRiengPage from "@/pages/admin/AKhoiDongRiengPage";
import AButPhaPage from "@/pages/admin/AButPhaPage";
import AVeDichPickQuestion from "@/pages/admin/AVeDichPickQuestionPage";
import AVeDichChungPage from "@/pages/admin/AVeDichChungPage";
import AVeDichRiengPage from "@/pages/admin/AVeDichRiengPage";
import AGiaiMaPage from "@/pages/admin/AGiaiMaPage";
import AQualifierPage from "@/pages/admin/AQualifierPage";
import AGameManagingPage from "@/pages/admin/AGameManagingPage";
import { AdminWebSocketProvider } from "@/contexts/AdminWebSocketContext";


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

const AdminRoutes = () => {
    // Prefer stored matchCode but fall back to extracting it from the URL path.
    // Exception: when on the qualifier (/vl) route, always use OC3_M_VL so
    // admin and players share the same WebSocket channel.
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
            <Routes>
            <Route path="/" element={<Navigate to="/admin/waiting" replace />} />
            {/* <Route path="/dashboard" element={} /> */}
            <Route
                path="/kdc/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongChungPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/kdr/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongRiengPage />
                    </ProtectedAdminRoute>
                }
            />
            {/* legacy alias `/kdcn` removed — use `/kdr/:matchCode` */}
            <Route
                path="/bp/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AButPhaPage />
                    </ProtectedAdminRoute>
                }
            />
            {/* VỀ ĐÍCH - Question picker pages */}
            <Route
                path="/vdc/pick/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichPickQuestion />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/vdr/pick/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichPickQuestion />
                    </ProtectedAdminRoute>
                }
            />
            {/* VỀ ĐÍCH - Gameplay pages */}
            <Route
                path="/vdc/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AVeDichChungPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/vdr/:matchCode"
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
                path="/gm/:matchCode"
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