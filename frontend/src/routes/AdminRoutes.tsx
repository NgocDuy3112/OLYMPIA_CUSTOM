import { Routes, Route, Navigate, useParams } from "react-router-dom";

import AKhoiDongChungPage from "@/pages/admin/AKhoiDongChungPage";
import AKhoiDongRiengPage from "@/pages/admin/AKhoiDongRiengPage";
import AButPhaPage from "@/pages/admin/AButPhaPage";
import ADashboardPage from "@/pages/admin/ADashboardPage";


interface AProtectedRouteProps {
    children: React.ReactNode;
}


export const ProtectedAdminRoute: React.FC<AProtectedRouteProps> = ({ children }) => {
    const { adminCode } = useParams<{ adminCode: string }>();
    // admin token and adminCode are stored in localStorage elsewhere in the app
    const token = localStorage.getItem("jwtToken_admin");
    const storedAdmin = localStorage.getItem("adminCode");

    if (!token || !storedAdmin || (adminCode && adminCode !== storedAdmin)) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}



const AdminRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/admin/waiting" replace />} />
            <Route path="/dashboard" element={<ADashboardPage />} />
            <Route
                path="/kdc/:matchCode/:adminCode"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongChungPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/kdr/:matchCode/:adminCode"
                element={
                    <ProtectedAdminRoute>
                        <AKhoiDongRiengPage />
                    </ProtectedAdminRoute>
                }
            />
            <Route
                path="/bp/:matchCode/:adminCode"
                element={
                    <ProtectedAdminRoute>
                        <AButPhaPage />
                    </ProtectedAdminRoute>
                }
            />
        </Routes>
    );
}


export default AdminRoutes;