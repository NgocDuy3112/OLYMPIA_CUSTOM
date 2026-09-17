import { Routes, Route, Navigate } from "react-router-dom";
import ProfilePage from "@/pages/profile/ProfilePage";
import { AuthGuard } from "@/components/auth/AuthGuard";

const ProfileRoutes = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <AuthGuard>
            <ProfilePage />
          </AuthGuard>
        }
      />
      <Route path="*" element={<Navigate to="/profile" replace />} />
    </Routes>
  );
};

export default ProfileRoutes;
