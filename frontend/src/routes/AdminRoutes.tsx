import { Routes, Route, Navigate } from "react-router-dom";

import AKhoiDongChungPage from "@/pages/admin/AKhoiDongChungPage";
// import AKhoiDongRiengPage from "@/pages/admin/AKhoiDongRiengPage";
import AButPhaPage from "@/pages/admin/AButPhaPage";
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



const AdminRoutes = () => {
    const matchCode = localStorage.getItem("matchCode") || "";

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
            {/* <Route
                path="/kdr/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongRiengPage />
                    </ProtectedAdminRoute>
                }
            /> */}
            <Route
                path="/bp/:matchCode"
                element={
                    <ProtectedAdminRoute>
                        <AButPhaPage />
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