import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PlayerRoutes from "@/routes/PlayerRoutes";
import AdminRoutes from "@/routes/AdminRoutes";
import PlayerSignupPage from "@/pages/auth/player/PlayerSignupPage";
import PlayerLoginPage from "@/pages/auth/player/PlayerLoginPage";
import AdminSignupPage from "@/pages/auth/admin/AdminSignupPage";
import AdminLoginPage from "@/pages/auth/admin/AdminLoginPage";
import ResetPasswordPage from "@/pages/auth/ResetPasswordPage";

function App() {
  return (
    <BrowserRouter>
      <div
        className="min-h-screen bg-oc bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url('/background/OC3_background.png')` }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          {/* Auth Routes */}
              {/* Legacy routes redirect to player auth by default */}
              <Route path="/signup" element={<PlayerSignupPage />} />
              <Route path="/login" element={<PlayerLoginPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

              {/* Role-specific auth routes */}
              <Route path="/player/login" element={<PlayerLoginPage />} />
              <Route path="/player/signup" element={<PlayerSignupPage />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/signup" element={<AdminSignupPage />} />
          {/* Player Routes */}
          <Route path="/player/*" element={<PlayerRoutes />}/>
          {/* Admin Routes */}
          <Route path="/admin/*" element={<AdminRoutes />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
