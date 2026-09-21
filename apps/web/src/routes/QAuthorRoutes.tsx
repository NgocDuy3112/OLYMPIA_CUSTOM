import { Routes, Route, Navigate } from "react-router-dom";
import QAuthorOverviewPage from "@/pages/qauthor/QAuthorOverviewPage";
import QAuthorBankPage from "@/pages/qauthor/QAuthorBankPage";
import QAuthorImportPage from "@/pages/qauthor/QAuthorImportPage";
import QAuthorMediaPage from "@/pages/qauthor/QAuthorMediaPage";
import QAuthorQuestionPage from "@/pages/qauthor/QAuthorQuestionPage";
import QAuthorQualifierPage from "@/pages/qauthor/QAuthorQualifierPage";
import QAuthorReviewsPage from "@/pages/qauthor/QAuthorReviewsPage";
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
          <Route path="/" element={<Navigate to="/operator/qauthor/overview" replace />} />
          <Route path="/overview" element={<QAuthorOverviewPage />} />
          <Route path="/bank" element={<QAuthorBankPage />} />
          <Route path="/import" element={<QAuthorImportPage />} />
          <Route path="/media" element={<QAuthorMediaPage />} />
          <Route path="/questions" element={<QAuthorQuestionPage />} />
          <Route path="/qualifier" element={<QAuthorQualifierPage />} />
          <Route path="/reviews" element={<QAuthorReviewsPage />} />
          <Route path="*" element={<Navigate to="/operator/qauthor/overview" replace />} />
        </Routes>
      </QAuthorLayout>
    </AuthGuard>
  );
};

export default QAuthorRoutes;
