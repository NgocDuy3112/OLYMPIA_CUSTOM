import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom"
import { RequireAuth, RedirectIfSignedIn } from "@/components/require-auth"
import { LoginPage } from "@/pages/LoginPage"
import { SignupPage } from "@/pages/SignupPage"
import { SessionProbe } from "@/pages/SessionProbePage"
import { PortalShell } from "@/components/portal-shell"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <RequireAuth>
              <SessionProbe />
            </RequireAuth>
          }
        />
        <Route
          element={
            <RequireAuth>
              <PortalShell />
            </RequireAuth>
          }
        >
          <Route path="/" element={<SessionProbe />} />
        </Route>
        <Route
          path="/login"
          element={
            <RedirectIfSignedIn>
              <LoginPage />
            </RedirectIfSignedIn>
          }
        />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}