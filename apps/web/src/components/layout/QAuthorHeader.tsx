import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User, HelpCircle } from "lucide-react";
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

interface QAuthorHeaderProps {
  userName?: string;
  onLogout?: () => void;
  /** Giữ tương thích shell cũ — toggle giờ do SidebarTrigger (shadcn) lo. */
  onToggleSidebar?: () => void;
}

export const QAuthorHeader: React.FC<QAuthorHeaderProps> = ({
  userName,
  onLogout,
}) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 bg-background/40 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <SidebarTrigger />
          <Button
            variant="ghost"
            onClick={() => navigate("/operator/qauthor/questions")}
            className="gap-2"
          >
            <HelpCircle size={18} className="text-success" />
            <span className="text-sm sm:text-base font-bold text-white">
              QAUTHOR
            </span>
          </Button>
        </div>

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
              <p className="text-xs text-muted-foreground">Question Author</p>
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
