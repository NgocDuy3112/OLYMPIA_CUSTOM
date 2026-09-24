import React, { useState } from "react";
import { Menu, Trophy } from "lucide-react";
import { PublicSidebar } from "./PublicSidebar";
import { PublicFooter } from "./PublicFooter";
import { useAuth } from "@/hooks/useAuth";

interface PublicLayoutProps {
  children: React.ReactNode;
}

/**
 * Public layout with a fixed left sidebar (desktop) and a top bar
 * with hamburger menu (mobile). Sidebar handles nav + auth state.
 */
export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <div className="min-h-screen flex">
      <PublicSidebar
        isAuthenticated={isAuthenticated}
        userName={user?.userName}
        userRole={user?.role}
        onLogout={handleLogout}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 lg:hidden bg-black/30 backdrop-blur-sm border-b border-white/10">
          <div className="flex items-center justify-between h-14 px-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Mở menu"
            >
              <Menu size={20} />
            </button>
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-blue-400" />
              <span className="text-sm font-bold text-white tracking-wide">
                OLYMPIA CUSTOM
              </span>
            </div>
            <div className="w-8" />
          </div>
        </header>

        <main className="flex-1 p-4 pb-28 sm:p-6">{children}</main>

        <PublicFooter />
      </div>
    </div>
  );
};
