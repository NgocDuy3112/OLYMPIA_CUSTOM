import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronsUpDown, LogOut } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";

export interface ShellNavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /** Mở browser tab mới (shell khác, vd admin → controller). */
  newTab?: boolean;
}

export interface ShellNavGroup {
  label: string;
  items: ShellNavItem[];
}

interface ShellSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** Nhãn shell: ADMIN / CONTROLLER / QAUTHOR / ... */
  shellName: string;
  brandIcon: React.ReactNode;
  /** Click logo → về trang gốc của shell. */
  brandHome: string;
  /** Tailwind class màu role, literal — vd "text-role-admin". */
  accentClass: string;
  /** Tailwind class active literal — vd "data-[active=true]:bg-role-admin/15 data-[active=true]:text-role-admin". */
  activeClass: string;
  /** Nhãn vai trò trong footer user card. */
  roleLabel: string;
  groups: ShellNavGroup[];
  /** Override footer (Public truyền nút Đăng nhập / menu riêng). */
  footer?: React.ReactNode;
  /** So khớp active tùy shell (vd "/admin" phải exact). */
  isItemActive?: (path: string) => boolean;
}

/**
 * Sidebar chuẩn theo shadcn Sidebar block (sidebar-01/07 pattern):
 * SidebarHeader (brand tile) → SidebarContent (group + label + menu)
 * → SidebarFooter (user card dropdown) → SidebarRail.
 * Thay 4 bản sidebar copy tay trước đây.
 */
export const ShellSidebar: React.FC<ShellSidebarProps> = ({
  shellName,
  brandIcon,
  brandHome,
  accentClass,
  activeClass,
  roleLabel,
  groups,
  footer,
  isItemActive,
  ...props
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  const { user, logout } = useAuth();

  const isActive = isItemActive ?? ((path: string) => location.pathname.startsWith(path));

  const go = (path: string, newTab?: boolean) => {
    if (newTab) {
      window.open(path, "_blank", "noopener");
      return;
    }
    navigate(path);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border" {...props}>
      {/* Brand tile — theo team-switcher của block */}
      <SidebarHeader className="border-b border-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip={shellName}
              onClick={() => go(brandHome)}
              className="data-[active=true]:bg-transparent data-[active=true]:text-foreground"
            >
              <div
                className={`flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 ${accentClass}`}
              >
                {brandIcon}
              </div>
              <span className="flex min-w-0 flex-col gap-0.5 leading-none text-left">
                <span className="truncate font-bold tracking-wide">
                  OLYMPIA CUSTOM
                </span>
                <span className="truncate text-xs opacity-70">{shellName}</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {groups
          .filter((g) => g.items.length > 0)
          .map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => {
                    const active = !item.newTab && isActive(item.path);
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          size="lg"
                          isActive={active}
                          tooltip={item.label}
                          className={activeClass}
                          onClick={() => go(item.path, item.newTab)}
                          title={item.newTab ? "Mở trong tab mới" : undefined}
                        >
                          {item.icon}
                          <span className="flex-1 text-left">{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
      </SidebarContent>

      {/* User card — chân sidebar chuẩn shadcn block */}
      <SidebarFooter className="border-t border-border p-2">
        {footer ??
          (user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" className="w-full" />}
              >
                <div
                  className={`flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 text-xs font-bold ${accentClass}`}
                >
                  {(user.userName ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <span className="flex min-w-0 flex-col gap-0.5 leading-none text-left">
                  <span className="truncate font-medium">{user.userName}</span>
                  <span className="truncate text-xs opacity-70">{roleLabel}</span>
                </span>
                <ChevronsUpDown className="ml-auto size-4 opacity-50" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <DropdownMenuLabel className="text-foreground">
                  <p className="text-sm text-foreground">{user.userName}</p>
                  <p className="text-xs text-muted-foreground">{roleLabel}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => void logout()}>
                  <LogOut size={16} />
                  <span>Đăng xuất</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null)}
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
};
