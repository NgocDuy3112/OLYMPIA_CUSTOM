import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

interface ShellHeaderProps {
  roleLabel: string;
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}

export const ShellHeader: React.FC<ShellHeaderProps> = ({ roleLabel, userName }) => {
  const { user } = useAuth();
  const displayName = userName ?? user?.userName;

  return (
    <header className="sticky top-0 z-40 glass">
      <div className="flex items-center justify-between h-12 px-3 sm:px-4">
        <SidebarTrigger />
        <div className="flex items-center gap-2 min-w-0">
          {displayName && (
            <span className="text-sm text-muted-foreground hidden sm:inline truncate">
              {displayName}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-xs bg-accent text-foreground/80 whitespace-nowrap">
            {roleLabel}
          </span>
        </div>
      </div>
    </header>
  );
};
