import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Play,
  ClipboardCheck,
  HelpCircle,
  KeyRound,
  ChevronRight,
  Gamepad2,
} from "lucide-react";
import { getMatchCode } from "@/utils/storage";
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
}

export const ControllerSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const matchCode = getMatchCode();

  const items: SidebarItem[] = [
    {
      label: "Tổng quan live",
      path: "/operator/controller/overview",
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: "Sảnh chờ",
      path: matchCode ? `/operator/controller/waiting/${matchCode}` : "/operator/controller",
      icon: <Play size={18} />,
    },
    {
      label: "Vòng loại",
      path: "/operator/controller/qualifier",
      icon: <HelpCircle size={18} />,
    },
    {
      label: "Duyệt điểm",
      path: "/operator/controller/reviews",
      icon: <ClipboardCheck size={18} />,
    },
    {
      label: "Câu hỏi trận này",
      path: "/operator/qauthor/bank",
      icon: <HelpCircle size={18} />,
    },
    {
      label: "MCP Tokens",
      path: "/operator/mcp-tokens",
      icon: <KeyRound size={18} />,
    },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Gamepad2 size={18} className="text-orange-400" />
          <span className="text-sm font-bold text-white">CONTROLLER</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = isActive(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={active}
                      tooltip={item.label}
                      className="data-[active=true]:bg-orange-600/20 data-[active=true]:text-orange-400"
                      onClick={() => {
                        navigate(item.path);
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      {active && (
                        <ChevronRight size={16} className="text-orange-400" />
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
