import React from "react";
import { Trophy } from "lucide-react";
import { PublicSidebar } from "./PublicSidebar";
import { PublicFooter } from "./PublicFooter";
import { useAuth } from "@/hooks/useAuth";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

interface PublicLayoutProps {
  children: React.ReactNode;
}

/**
 * Public layout: shadcn SidebarProvider — sidebar cố định desktop,
 * drawer mobile (Base UI Sheet) mở bằng trigger trong SidebarInset.
 */
export const PublicLayout: React.FC<PublicLayoutProps> = ({ children }) => {
  const { isAuthenticated, user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SidebarProvider className="min-h-screen bg-background/30">
      <PublicSidebar
        isAuthenticated={isAuthenticated}
        userName={user?.userName}
        userRole={user?.role}
        onLogout={handleLogout}
      />
      <SidebarInset className="min-h-screen flex flex-col bg-transparent">
        {/* Mobile top bar — SidebarTrigger mở drawer (Base UI Sheet) */}
        <header className="sticky top-0 z-30 md:hidden glass">
          <div className="flex items-center h-12 px-4 gap-3">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Trophy size={18} className="text-brand" />
              <span className="text-sm font-bold text-foreground tracking-wide">
                OLYMPIA CUSTOM
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-28 sm:p-6">{children}</main>
        <PublicFooter />
      </SidebarInset>
    </SidebarProvider>
  );
};
