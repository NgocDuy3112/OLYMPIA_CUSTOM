import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Trophy,
  Gamepad2,
  Users,
  ChevronRight,
  X,
} from "lucide-react";

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Dashboard", path: "/admin", icon: <LayoutDashboard size={18} /> },
  {
    label: "Giải đấu",
    path: "/admin/tournaments",
    icon: <Trophy size={18} />,
  },
  {
    label: "Trận đấu",
    path: "/admin/game-managing",
    icon: <Gamepad2 size={18} />,
  },
  { label: "Người dùng", path: "/admin/users", icon: <Users size={18} /> },
];

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
  isOpen = true,
  onClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-[#0a1628] border-r border-white/10
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Mobile close button */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 lg:hidden">
          <span className="text-sm font-bold text-white">Menu</span>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-3 space-y-1">
          {SIDEBAR_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => {
                  navigate(item.path);
                  onClose?.();
                }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                  ${
                    active
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {item.icon}
                <span className="flex-1 text-left text-sm font-medium">
                  {item.label}
                </span>
                {active && <ChevronRight size={16} className="text-blue-400" />}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
