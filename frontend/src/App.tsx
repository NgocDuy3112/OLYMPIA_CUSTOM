import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "@/pages/auth/LoginPage";
import SignupPage from "@/pages/auth/SignupPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";

const PlayerRoutes = lazy(() => import("@/routes/PlayerRoutes"));
const AdminRoutes = lazy(() => import("@/routes/AdminRoutes"));
const MCRoutes = lazy(() => import("@/routes/MCRoutes"));

function App() {
  return (
    <BrowserRouter>
      <div
        className="min-h-screen bg-oc bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/background/OC3_background.png')` }}
      >
        <Suspense fallback={null}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/signup" element={<SignupPage password />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/player/signup" element={<SignupPage />} />
            <Route path="/admin/signup" element={<SignupPage mode="admin" />} />
            <Route path="/player/*" element={<PlayerRoutes />} />
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="/mc/*" element={<MCRoutes />} />
          </Routes>
        </Suspense>
      </div>
    </BrowserRouter>
  )
}

export default App
