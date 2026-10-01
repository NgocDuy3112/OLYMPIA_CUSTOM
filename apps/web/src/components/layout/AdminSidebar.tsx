import React from "react";
import { useLocation } from "react-router-dom";
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
  Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ShellSidebar, type ShellNavGroup } from "./ShellSidebar";

/**
 * Admin shell sidebar — cấu hình cho ShellSidebar (shadcn Sidebar block).
 * Admin tracks operations (giải đấu, lịch, người dùng, audit); nội dung
 * câu hỏi/điều live nhảy tab mới sang shell qauthor/controller.
 */
export const AdminSidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const groups: ShellNavGroup[] = [
    {
      label: "Vận hành",
      items: [
        { label: "Dashboard", path: "/admin", icon: <LayoutDashboard size={18} /> },
        { label: "Giải đấu", path: "/admin/tournaments", icon: <Trophy size={18} /> },
        { label: "Lịch thi đấu", path: "/admin/schedule", icon: <Gamepad2 size={18} /> },
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
      ],
    },
    {
      label: "Hệ thống",
      items: isAdmin
        ? [
            { label: "Người dùng", path: "/admin/users", icon: <Users size={18} /> },
            { label: "Duyệt bank", path: "/admin/bank-review", icon: <ClipboardCheck size={18} /> },
            { label: "Nhật ký", path: "/admin/audit", icon: <ScrollText size={18} /> },
            { label: "MCP Tokens", path: "/admin/mcp-tokens", icon: <KeyRound size={18} /> },
            { label: "Checkpoints", path: "/admin/checkpoints", icon: <DatabaseBackup size={18} /> },
            { label: "Sức khỏe", path: "/admin/health", icon: <Activity size={18} /> },
          ]
        : [],
    },
  ];

  return (
    <ShellSidebar
      shellName="ADMIN"
      brandIcon={<Shield size={16} />}
      brandHome="/admin"
      accentClass="text-role-admin"
      activeClass="data-[active=true]:bg-role-admin/15 data-[active=true]:text-role-admin"
      roleLabel="Admin"
      groups={groups}
      isItemActive={(path) =>
        path === "/admin"
          ? location.pathname === "/admin"
          : location.pathname.startsWith(path)
      }
    />
  );
};
