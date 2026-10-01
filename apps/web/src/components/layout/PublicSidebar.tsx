import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Trophy, LogIn, LogOut, User, Swords, BookOpen, ChevronsUpDown } from "lucide-react";
import { useSidebar, SidebarMenuButton } from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ShellSidebar, type ShellNavGroup, type ShellNavItem } from "./ShellSidebar";

interface PublicSidebarProps {
  isAuthenticated?: boolean;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

const BASE_ITEMS: ShellNavItem[] = [
  { label: "Giải đấu", path: "/", icon: <Swords size={18} /> },
  { label: "Luật chơi", path: "/info/rules", icon: <BookOpen size={18} /> },
];

const ROLE_LABEL: Record<string, string> = {
  player: "Thí sinh",
  spectator: "Khán giả",
};

/**
 * Public sidebar — cũng theo shadcn Sidebar block (ShellSidebar),
 * footer riêng: Đăng nhập hoặc user card + Đăng xuất.
 */
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

  const go = (path: string) => {
    navigate(path);
    if (isMobile) setOpenMobile(false);
  };

  const groups: ShellNavGroup[] = [
    {
      label: "Khám phá",
      items: [
        ...BASE_ITEMS,
        ...(showProfile
          ? [{ label: "Hồ sơ", path: "/profile", icon: <User size={18} /> } as ShellNavItem]
          : []),
      ],
    },
  ];

  const footer = !isAuthenticated ? (
    <Button variant="default" className="h-11 w-full gap-2" onClick={() => go("/login")}>
      <LogIn size={16} />
      <span>Đăng nhập</span>
    </Button>
  ) : (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="w-full" />}>
        <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary/15 text-xs font-bold text-role-admin">
          {(userName ?? "?").slice(0, 2).toUpperCase()}
        </div>
        <span className="flex min-w-0 flex-col gap-0.5 leading-none text-left">
          <span className="truncate font-medium">{userName}</span>
          <span className="truncate text-xs opacity-70">
            {ROLE_LABEL[userRole ?? ""] ?? "Tài khoản"}
          </span>
        </span>
        <ChevronsUpDown className="ml-auto size-4 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-56">
        <DropdownMenuLabel className="text-foreground">
          <p className="text-sm text-foreground">{userName}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[userRole ?? ""] ?? "Tài khoản"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showProfile && (
          <DropdownMenuItem onClick={() => go("/profile")}>
            <User size={16} />
            <span>Hồ sơ</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => {
            onLogout?.();
            if (isMobile) setOpenMobile(false);
          }}
        >
          <LogOut size={16} />
          <span>Đăng xuất</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <ShellSidebar
      shellName="Cộng đồng"
      brandIcon={<Trophy size={16} />}
      brandHome="/"
      accentClass="text-role-admin"
      activeClass="data-[active=true]:bg-role-admin/15 data-[active=true]:text-role-admin"
      roleLabel={ROLE_LABEL[userRole ?? ""] ?? "Tài khoản"}
      groups={groups}
      footer={footer}
      isItemActive={(path) =>
        path === "/" ? location.pathname === "/" : location.pathname.startsWith(path)
      }
    />
  );
};
