import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Database,
  Swords,
  ListOrdered,
  Bot,
  KeyRound,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
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

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Ngân hàng câu hỏi",
    path: "/operator/qauthor/bank",
    icon: <Database size={18} />,
  },
  {
    label: "Câu hỏi trận",
    path: "/operator/qauthor/match",
    icon: <Swords size={18} />,
  },
  {
    label: "Vòng loại",
    path: "/operator/qauthor/qualifier",
    icon: <ListOrdered size={18} />,
  },
  {
    label: "AI Agent",
    path: "/operator/qauthor/agent",
    icon: <Bot size={18} />,
  },
  {
    label: "MCP Tokens",
    path: "/operator/mcp-tokens",
    icon: <KeyRound size={18} />,
  },
];

export const QAuthorSidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border">
      <SidebarHeader className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <HelpCircle size={18} className="text-role-qauthor" />
          <span className="text-sm font-bold text-foreground">QAUTHOR</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {SIDEBAR_ITEMS.map((item) => {
                const active = isActive(item.path);
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton size="lg"
                      isActive={active}
                      tooltip={item.label}
                      className="data-[active=true]:bg-role-qauthor/20 data-[active=true]:text-role-qauthor"
                      onClick={() => {
                        navigate(item.path);
                        if (isMobile) setOpenMobile(false);
                      }}
                    >
                      {item.icon}
                      <span className="flex-1 text-left">{item.label}</span>
                      {active && (
                        <ChevronRight size={16} className="text-role-qauthor" />
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
