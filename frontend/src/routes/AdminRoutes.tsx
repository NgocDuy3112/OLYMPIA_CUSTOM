import { Routes, Route, Navigate, useParams } from "react-router-dom";


import AKhoiDongChungPage from "@/pages/admin/AKhoiDongChungPage";
import AKhoiDongRiengPage from "@/pages/admin/AKhoiDongRiengPage";
import AButPhaPage from "@/pages/admin/AButPhaPage";



interface AProtectedRouteProps {
    children: React.ReactNode;
}


export const ProtectedAdminRoute: React.FC<AProtectedRouteProps> = ({ children }) => {
    const { adminCode } = useParams<{ adminCode: string }>();
    const token = sessionStorage.getItem("jwtToken_admin");
    const storedAdmin = sessionStorage.getItem("adminCode");

    if (!token || !storedAdmin || (adminCode && adminCode !== storedAdmin)) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
}



const AdminRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/admin/waiting" replace />} />
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