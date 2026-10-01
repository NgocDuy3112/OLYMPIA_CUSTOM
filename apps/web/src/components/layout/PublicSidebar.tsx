import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Trophy,
  LogIn,
  LogOut,
  User,
  Swords,
  BookOpen,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

interface PublicSidebarProps {
  isAuthenticated?: boolean;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const BASE_ITEMS: SidebarItem[] = [
  { label: "Giải đấu", path: "/", icon: <Swords size={18} /> },
  { label: "Luật chơi", path: "/info/rules", icon: <BookOpen size={18} /> },
];

export const PublicSidebar: React.FC<PublicSidebarProps> = ({
  isAuthenticated = false,
  userName,
  userRole,
  onLogout,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  // Hồ sơ chỉ dành cho player/spectator.
  const showProfile = userRole === "player" || userRole === "spectator";

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const go = (path: string) => {
    navigate(path);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-5 py-5">
        <Button
          variant="ghost"
          onClick={() => go("/")}
          className="gap-2 px-2"
        >
          <Trophy size={22} className="text-brand" />
          <span className="text-base font-bold text-white tracking-wide">
            OLYMPIA CUSTOM
          </span>
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {[
                ...BASE_ITEMS,
                ...(showProfile
                  ? [{ label: "Hồ sơ", path: "/profile", icon: <User size={18} /> } as SidebarItem]
                  : []),
              ].map((item) => {
                const active = isActive(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="data-[active=true]:bg-primary/20 data-[active=true]:text-brand"
                      onClick={() => go(item.path)}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-border p-3">
        {isAuthenticated ? (
          <div className="space-y-1">
            {showProfile ? (
              <Button
                variant="ghost"
                className="w-full justify-start gap-2"
                onClick={() => go("/profile")}
              >
                <User size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-white truncate">{userName}</span>
              </Button>
            ) : (
              <div className="w-full flex items-center gap-2 px-3 py-2">
                <User size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground truncate">{userName}</span>
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              onClick={() => {
                onLogout?.();
                if (isMobile) setOpenMobile(false);
              }}
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Đăng xuất</span>
            </Button>
          </div>
        ) : (
          <Button
            variant="default"
            className="w-full gap-2"
            onClick={() => go("/login")}
          >
            <LogIn size={16} />
            <span>Đăng nhập</span>
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
};
