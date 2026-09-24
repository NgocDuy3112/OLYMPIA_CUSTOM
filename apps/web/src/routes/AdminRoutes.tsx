import { useState } from "react";
import {
  Routes,
  Route,
} from "react-router-dom";

import AdminGameManagingPage from "@/pages/admin/AdminGameManagingPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminHealthPage from "@/pages/admin/AdminHealthPage";
import AdminUsersPage from "@/pages/admin/AdminUsersPage";
import AdminAuditPage from "@/pages/admin/AdminAuditPage";
import AdminCheckpointsPage from "@/pages/admin/AdminCheckpointsPage";
import AdminBankReviewPage from "@/pages/admin/AdminBankReviewPage";
import TournamentListPage from "@/pages/admin/tournament/TournamentListPage";
import TournamentFormPage from "@/pages/admin/tournament/TournamentFormPage";
import TournamentDetailPage from "@/pages/admin/tournament/TournamentDetailPage";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AdminHeader, AdminSidebar } from "@/components/layout";

// Admin Layout wrapper for management pages
const AdminLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-black/20">
      <AdminHeader
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <div className="flex flex-1">
        <AdminSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

const AdminRoutes = () => {
  // Management pages with AdminLayout — CRUD only.
  // Live control moved to ControllerRoutes (/operator/controller/*).
  return (
    <AuthGuard requiredRole="admin">
      <AdminLayout>
        <Routes>
          <Route
            path="/"
            element={<AdminDashboardPage />}
          />
          <Route path="/manage" element={<AdminGameManagingPage />} />
          <Route path="/game-managing" element={<AdminGameManagingPage />} />
          <Route path="/schedule" element={<AdminGameManagingPage />} />
          <Route path="/users" element={<AdminUsersPage />} />
          <Route path="/bank-review" element={<AdminBankReviewPage />} />
          <Route path="/health" element={<AdminHealthPage />} />
          <Route path="/audit" element={<AdminAuditPage />} />
          <Route path="/checkpoints" element={<AdminCheckpointsPage />} />
          {/* Tournament management routes */}
          <Route path="/tournaments" element={<TournamentListPage />} />
          <Route path="/tournaments/create" element={<TournamentFormPage />} />
          <Route path="/tournaments/:code" element={<TournamentDetailPage />} />
          <Route
            path="/tournaments/:code/edit"
            element={<TournamentFormPage />}
          />
        </Routes>
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminRoutes;
