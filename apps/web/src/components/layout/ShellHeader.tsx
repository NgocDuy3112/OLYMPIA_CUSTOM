import React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";

interface ShellHeaderProps {
  /** Nhãn vai trò hiển thị bên phải (Admin / Controller / Question Author). */
  roleLabel: string;
  /** Override tên user (mặc định lấy từ useAuth). */
  userName?: string;
  /** Không còn dùng — user menu đã chuyển xuống footer của ShellSidebar. */
  onLogout?: () => void;
  /** Không còn dùng — giữ để các wrapper cũ không vỡ type. */
  onToggleSidebar?: () => void;
}

/**
 * Header của shell operator — gọn theo shadcn block pattern
 * (SidebarTrigger + ngữ cảnh). Toàn bộ điều hướng + user card nằm ở ShellSidebar.
 */
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
