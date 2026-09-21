import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  HelpCircle,
  ClipboardCheck,
  Users,
  ChevronRight,
  X,
} from "lucide-react";

interface QAuthorSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    label: "Tổng quan",
    path: "/operator/qauthor/overview",
    icon: <LayoutDashboard size={18} />,
  },
  {
    label: "Câu hỏi",
    path: "/operator/qauthor/questions",
    icon: <HelpCircle size={18} />,
  },
  {
    label: "Bank QB_*",
    path: "/operator/qauthor/bank",
    icon: <HelpCircle size={18} />,
  },
  {
    label: "Media",
    path: "/operator/qauthor/media",
    icon: <HelpCircle size={18} />,
  },
  {
    label: "Import Excel",
    path: "/operator/qauthor/import",
    icon: <HelpCircle size={18} />,
  },
  {
    label: "Vòng loại",
    path: "/operator/qauthor/qualifier",
    icon: <HelpCircle size={18} />,
  },
  {
    label: "Duyệt điểm",
    path: "/operator/qauthor/reviews",
    icon: <ClipboardCheck size={18} />,
  },
  { label: "Hồ sơ", path: "/profile", icon: <Users size={18} /> },
];

export const QAuthorSidebar: React.FC<QAuthorSidebarProps> = ({
  isOpen = true,
  onClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

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
                      ? "bg-green-600/20 text-green-400"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {item.icon}
                <span className="flex-1 text-left text-sm font-medium">
                  {item.label}
                </span>
                {active && <ChevronRight size={16} className="text-green-400" />}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};
