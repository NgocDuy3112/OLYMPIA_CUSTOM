import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Trophy,
  Gamepad2,
  Users,
  ScrollText,
  DatabaseBackup,
  HelpCircle,
  ClipboardCheck,
  Activity,
  KeyRound,
  ChevronRight,
  ExternalLink,
  Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /** Mở browser tab mới thay vì điều hướng trong shell (cho shell khác). */
  newTab?: boolean;
}

export const AdminSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Admin tracks operations only (tournaments, matches, users, audit).
  // Question content lives in the separate QAuthor shell — admin jumps
  // there via cross-link (admin bypasses qauthor guards backend-side).
  // Live control lives in the separate Controller shell.
  // Cả hai mở browser tab mới để không mất ngữ cảnh admin.
  const SIDEBAR_ITEMS: SidebarItem[] = [
    { label: "Dashboard", path: "/admin", icon: <LayoutDashboard size={18} /> },
    ...(isAdmin
      ? [
          {
            label: "Live (Controller)",
            path: "/operator/controller/overview",
            icon: <Gamepad2 size={18} />,
            newTab: true,
          },
          {
            label: "Câu hỏi (QAuthor)",
            path: "/operator/qauthor/overview",
            icon: <HelpCircle size={18} />,
            newTab: true,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            label: "Giải đấu",
            path: "/admin/tournaments",
            icon: <Trophy size={18} />,
          },
          {
            label: "Lịch thi đấu",
            path: "/admin/schedule",
            icon: <Gamepad2 size={18} />,
          },
          { label: "Người dùng", path: "/admin/users", icon: <Users size={18} /> },
          { label: "Duyệt bank", path: "/admin/bank-review", icon: <ClipboardCheck size={18} /> },
          { label: "Nhật ký", path: "/admin/audit", icon: <ScrollText size={18} /> },
          { label: "MCP Tokens", path: "/admin/mcp-tokens", icon: <KeyRound size={18} /> },
          { label: "Checkpoints", path: "/admin/checkpoints", icon: <DatabaseBackup size={18} /> },
          { label: "Sức khỏe", path: "/admin/health", icon: <Activity size={18} /> },
        ]
      : []),
  ];

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-brand" />
          <span className="text-sm font-bold text-white">ADMIN</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {SIDEBAR_ITEMS.map((item) => {
                const active = !item.newTab && isActive(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="data-[active=true]:bg-primary/20 data-[active=true]:text-brand"
                      onClick={() => {
                        if (item.newTab) {
                          window.open(item.path, "_blank", "noopener");
                        } else {
                          navigate(item.path);
                          if (isMobile) setOpenMobile(false);
                        }
                      }}
                      title={item.newTab ? "Mở trong tab mới" : undefined}
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.newTab ? (
                        <ExternalLink size={14} className="text-muted-foreground/70" />
                      ) : (
                        active && (
                          <ChevronRight size={16} className="text-brand" />
                        )
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
};
