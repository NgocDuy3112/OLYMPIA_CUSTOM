import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

interface ShellHeaderProps {
  roleLabel: string;
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
  center?: React.ReactNode;
  end?: React.ReactNode;
}

export const ShellHeader: React.FC<ShellHeaderProps> = ({ roleLabel, userName, center, end }) => {
  const { user } = useAuth();
  const displayName = userName ?? user?.userName;

  return (
    <header className="sticky top-0 z-40 glass">
      <div className="flex items-center justify-between h-12 px-3 sm:px-4 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <SidebarTrigger />
          {center && (
            <div className="flex items-center justify-center gap-1 sm:gap-2 flex-1 min-w-0">
              {center}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          {end}
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
