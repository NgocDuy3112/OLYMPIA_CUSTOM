import { Routes, Route, Navigate } from "react-router-dom";
import QAuthorBankHubPage from "@/pages/qauthor/QAuthorBankHubPage";
import QAuthorMatchPage from "@/pages/qauthor/QAuthorMatchPage";
import QAuthorQualifierPage from "@/pages/qauthor/QAuthorQualifierPage";
import QAuthorAgentPage from "@/pages/qauthor/QAuthorAgentPage";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { QAuthorHeader, QAuthorSidebar } from "@/components/layout";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

const QAuthorLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <SidebarProvider className="min-h-screen bg-background/30">
      <QAuthorSidebar />
      <SidebarInset className="min-h-screen flex flex-col bg-transparent">
        <QAuthorHeader />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};

const QAuthorRoutes = () => {
  return (
    <AuthGuard requiredRole="operator" requiredScope="qauthor">
      <QAuthorLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/bank" element={<QAuthorBankHubPage />} />
          <Route path="/match" element={<QAuthorMatchPage />} />
          <Route path="/qualifier" element={<QAuthorQualifierPage />} />
          <Route path="/agent" element={<QAuthorAgentPage />} />
          {/* Legacy: gom về trang mới */}
          <Route path="/overview" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/import" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/media" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/questions" element={<Navigate to="/operator/qauthor/match" replace />} />
          <Route path="/reviews" element={<Navigate to="/operator/controller/reviews" replace />} />
          <Route path="*" element={<Navigate to="/operator/qauthor/bank" replace />} />
        </Routes>
      </QAuthorLayout>
    </AuthGuard>
  );
};

export default QAuthorRoutes;
