import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Play,
  ClipboardCheck,
  HelpCircle,
  Users,
  ChevronRight,
  X,
} from "lucide-react";
import { getMatchCode } from "@/utils/storage";

interface ControllerSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

export const ControllerSidebar: React.FC<ControllerSidebarProps> = ({
  isOpen = true,
  onClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const matchCode = getMatchCode();

  const items: SidebarItem[] = [
    {
      label: "Tổng quan live",
      path: "/controller/overview",
      icon: <LayoutDashboard size={18} />,
    },
    {
      label: "Sảnh chờ",
      path: matchCode ? `/controller/waiting/${matchCode}` : "/controller",
      icon: <Play size={18} />,
    },
    {
      label: "Duyệt điểm",
      path: "/operator/qauthor/reviews",
      icon: <ClipboardCheck size={18} />,
    },
    {
      label: "Câu hỏi trận này",
      path: "/operator/qauthor/questions",
      icon: <HelpCircle size={18} />,
    },
    { label: "Hồ sơ", path: "/profile", icon: <Users size={18} /> },
  ];

  const isActive = (path: string) => location.pathname.startsWith(path);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-[#12102e] border-r border-white/10
          transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 lg:hidden">
          <span className="text-sm font-bold text-white">Menu</span>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {items.map((item) => {
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
                      ? "bg-orange-600/20 text-orange-400"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {item.icon}
                <span className="flex-1 text-left text-sm font-medium">
                  {item.label}
                </span>
                {active && <ChevronRight size={16} className="text-orange-400" />}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
