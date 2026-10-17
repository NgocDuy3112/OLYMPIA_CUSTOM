import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"
import { SessionProbe } from "./pages/SessionProbePage"


export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SessionProbe />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}