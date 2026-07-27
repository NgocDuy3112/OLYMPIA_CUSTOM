import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import PlayerRoutes from "@/routes/PlayerRoutes";
import AdminRoutes from "@/routes/AdminRoutes";
import MCRoutes from "@/routes/MCRoutes";
import LoginPage from "@/pages/auth/LoginPage";
import PlayerSignupPage from "@/pages/auth/player/PlayerSignupPage";
import AdminSignupPage from "@/pages/auth/admin/AdminSignupPage";
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
          {}
              <Route path="/signup" element={<PlayerSignupPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
              <Route path="/player/signup" element={<PlayerSignupPage />} />
              <Route path="/admin/signup" element={<AdminSignupPage />} />
          {}
          <Route path="/player/*" element={<PlayerRoutes />}/>
          {}
          <Route path="/admin/*" element={<AdminRoutes />} />
          {}
          <Route path="/mc/*" element={<MCRoutes />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
