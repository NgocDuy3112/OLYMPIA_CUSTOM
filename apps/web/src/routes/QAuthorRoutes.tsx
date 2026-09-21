import { Routes, Route, Navigate } from "react-router-dom";
import QAuthorBankHubPage from "@/pages/qauthor/QAuthorBankHubPage";
import QAuthorAgentPage from "@/pages/qauthor/QAuthorAgentPage";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { QAuthorHeader, QAuthorSidebar } from "@/components/layout";
import { useState } from "react";

const QAuthorLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-black/20">
      <QAuthorHeader onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
      <div className="flex flex-1">
        <QAuthorSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <main className="flex-1 p-4 sm:p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
};

const QAuthorRoutes = () => {
  return (
    <AuthGuard requiredRole="operator" requiredScope="qauthor">
      <QAuthorLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/bank" element={<QAuthorBankHubPage />} />
          <Route path="/agent" element={<QAuthorAgentPage />} />
          {/* Legacy: gom về hub Bank */}
          <Route path="/overview" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/import" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/media" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/questions" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/qualifier" element={<Navigate to="/operator/qauthor/bank" replace />} />
          <Route path="/reviews" element={<Navigate to="/controller/reviews" replace />} />
          <Route path="*" element={<Navigate to="/operator/qauthor/bank" replace />} />
        </Routes>
      </QAuthorLayout>
    </AuthGuard>
  );
};

export default QAuthorRoutes;
