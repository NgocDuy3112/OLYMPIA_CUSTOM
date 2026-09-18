import { Routes, Route, Navigate } from "react-router-dom";
import QAuthorQuestionPage from "@/pages/qauthor/QAuthorQuestionPage";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AdminHeader, AdminSidebar } from "@/components/layout";
import { useState } from "react";

const QAuthorLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-black/20">
      <AdminHeader onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />
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

const QAuthorRoutes = () => {
  return (
    <AuthGuard requiredRole="operator" requiredScope="question_creator">
      <QAuthorLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/operator/qauthor/questions" replace />} />
          <Route path="/questions" element={<QAuthorQuestionPage />} />
          <Route path="*" element={<Navigate to="/operator/qauthor/questions" replace />} />
        </Routes>
      </QAuthorLayout>
    </AuthGuard>
  );
};

export default QAuthorRoutes;
