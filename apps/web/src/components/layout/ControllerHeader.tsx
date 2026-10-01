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

interface ControllerHeaderProps {
  userName?: string;
  onLogout?: () => void;
  /** Giữ tương thích shell cũ — toggle giờ do SidebarTrigger (shadcn) lo. */
  onToggleSidebar?: () => void;
}

export const ControllerHeader: React.FC<ControllerHeaderProps> = ({
  userName,
  onLogout,
}) => {
  return (
    <header className="sticky top-0 z-40 glass">
      <div className="flex items-center justify-between px-4 py-2.5">
        <SidebarTrigger />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-2 px-3" />
            }
          >
            <User size={16} className="text-muted-foreground" />
            <span className="text-sm text-foreground hidden sm:inline">
              {userName}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-foreground">
              <p className="text-sm text-foreground">{userName}</p>
              <p className="text-xs text-muted-foreground">Controller</p>
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
