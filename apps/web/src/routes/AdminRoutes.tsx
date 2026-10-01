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
import AdminMcpTokensPage from "@/pages/admin/AdminMcpTokensPage";
import TournamentListPage from "@/pages/admin/tournament/TournamentListPage";
import TournamentDetailPage from "@/pages/admin/tournament/TournamentDetailPage";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AdminHeader, AdminSidebar } from "@/components/layout";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

// Admin Layout wrapper for management pages
const AdminLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <SidebarProvider className="min-h-screen bg-background/30">
      <AdminSidebar />
      <SidebarInset className="min-h-screen flex flex-col bg-transparent">
        <AdminHeader />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
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
          <Route path="/mcp-tokens" element={<AdminMcpTokensPage />} />
          <Route path="/checkpoints" element={<AdminCheckpointsPage />} />
          {/* Tournament management routes */}
          <Route path="/tournaments" element={<TournamentListPage />} />
          <Route path="/tournaments/:code" element={<TournamentDetailPage />} />
        </Routes>
      </AdminLayout>
    </AuthGuard>
  );
};

export default AdminRoutes;
