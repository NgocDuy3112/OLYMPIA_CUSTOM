import React from "react";
import { LogOut, User } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

interface ShellHeaderProps {
  /** Nhãn vai trò hiển thị trong menu user (Admin / Controller / Question Author). */
  roleLabel: string;
  /** Override tên user (mặc định lấy từ useAuth). */
  userName?: string;
  /** Override logout (mặc định lấy từ useAuth). */
  onLogout?: () => void;
  /** Không còn dùng — giữ để các wrapper cũ không vỡ type. */
  onToggleSidebar?: () => void;
}

/**
 * Header chuẩn cho các shell dùng SidebarProvider (admin, controller, qauthor).
 * Trước đây 3 component copy y hệt nhau — giờ chỉ khác `roleLabel`.
 */
export const ShellHeader: React.FC<ShellHeaderProps> = ({
  roleLabel,
  userName,
  onLogout,
}) => {
  const { user, logout } = useAuth();
  const displayName = userName ?? user?.userName;
  const handleLogout = onLogout ?? logout;

  return (
    <header className="sticky top-0 z-40 glass">
      <div className="flex items-center justify-between h-12 px-3 sm:px-4">
        <SidebarTrigger />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2 px-3" />
            }
          >
            <User size={16} className="text-muted-foreground" aria-hidden />
            <span className="text-sm text-foreground hidden sm:inline">
              {displayName}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-foreground">
              <p className="text-sm text-foreground">{displayName}</p>
              <p className="text-xs text-muted-foreground">{roleLabel}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => handleLogout?.()}
            >
              <LogOut size={16} />
              <span>Đăng xuất</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
