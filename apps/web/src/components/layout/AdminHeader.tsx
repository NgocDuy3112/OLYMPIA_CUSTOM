import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, Shield } from "lucide-react";
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

interface AdminHeaderProps {
  userName?: string;
  onLogout?: () => void;
  /** Giữ tương thích shell cũ — toggle giờ do SidebarTrigger (shadcn) lo. */
  onToggleSidebar?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
  userName,
  onLogout,
}) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-background/40 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-4 py-2.5">
        {/* Left: Sidebar toggle + Logo */}
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Button
            variant="ghost"
            onClick={() => navigate("/admin")}
            className="gap-2"
          >
            <Shield size={18} className="text-brand" />
            <span className="text-sm sm:text-base font-bold text-white">
              ADMIN
            </span>
          </Button>
        </div>

        {/* Right: User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2 px-3" />
            }
          >
            <User size={16} className="text-muted-foreground" />
            <span className="text-sm text-white hidden sm:inline">
              {userName}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-white">
              <p className="text-sm text-white">{userName}</p>
              <p className="text-xs text-muted-foreground">Admin</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onLogout?.()}
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
