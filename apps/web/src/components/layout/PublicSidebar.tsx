import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Trophy,
  X,
  LogIn,
  LogOut,
  User,
  Swords,
  BookOpen,
} from "lucide-react";

interface PublicSidebarProps {
  isAuthenticated?: boolean;
  userName?: string;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

interface SidebarItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Giải đấu", path: "/", icon: <Swords size={18} /> },
  { label: "Luật chơi", path: "/info/rules", icon: <BookOpen size={18} /> },
];

export const PublicSidebar: React.FC<PublicSidebarProps> = ({
  isAuthenticated = false,
  userName,
  onLogout,
  isOpen = false,
  onClose,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const go = (path: string) => {
    navigate(path);
    onClose?.();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-[#12102e] border-r border-white/10
          flex flex-col transform transition-transform duration-200 ease-in-out
          lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
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

        {/* Logo */}
        <button
          onClick={() => go("/")}
          className="hidden lg:flex items-center gap-2 px-5 py-5 shrink-0"
        >
          <Trophy size={22} className="text-blue-400" />
          <span className="text-base font-bold text-white tracking-wide">
            OLYMPIA CUSTOM
          </span>
        </button>

        {/* Navigation */}
        <nav className="p-3 space-y-1 flex-1">
          {SIDEBAR_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
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
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Auth section */}
        <div className="p-3 border-t border-white/10">
          {isAuthenticated ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg">
                <User size={16} className="text-gray-400 shrink-0" />
                <span className="text-sm text-white truncate">{userName}</span>
              </div>
              <button
                onClick={() => {
                  onLogout?.();
                  onClose?.();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <LogOut size={18} />
                <span className="text-sm font-medium">Đăng xuất</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => go("/login")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <LogIn size={16} />
              <span>Đăng nhập</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
