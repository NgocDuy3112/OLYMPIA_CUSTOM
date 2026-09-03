import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, X, LogIn, LogOut, User, Trophy } from "lucide-react";

interface PublicHeaderProps {
  isAuthenticated?: boolean;
  userName?: string;
  userRole?: string;
  onLogout?: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  isAuthenticated = false,
  userName,
  userRole,
  onLogout,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navLinks = [
    { label: "Giải đấu", path: "/" },
    { label: "Luật chơi", path: "/info/rules" },
  ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-40 bg-black/30 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 shrink-0"
          >
            <Trophy size={20} className="text-blue-400" />
            <span className="text-sm sm:text-lg font-bold text-white tracking-wide">
              OLYMPIA CUSTOM
            </span>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => navigate(link.path)}
                className={`
                  px-3 py-2 text-sm font-medium rounded-lg transition-colors
                  ${
                    isActive(link.path)
                      ? "text-white bg-white/10"
                      : "text-gray-300 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg">
                  <User size={16} className="text-gray-400" />
                  <span className="text-sm text-white">{userName}</span>
                </div>
                <button
                  onClick={onLogout}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                  title="Đăng xuất"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <LogIn size={16} />
                <span>Đăng nhập</span>
              </button>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/50 backdrop-blur-sm">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <button
                key={link.path}
                onClick={() => {
                  navigate(link.path);
                  setIsMobileMenuOpen(false);
                }}
                className={`
                  block w-full text-left px-3 py-2 text-sm font-medium rounded-lg transition-colors
                  ${
                    isActive(link.path)
                      ? "text-white bg-white/10"
                      : "text-gray-300 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {link.label}
              </button>
            ))}

            <div className="pt-2 mt-2 border-t border-white/10">
              {isAuthenticated ? (
                <>
                  <div className="px-3 py-2 text-sm text-gray-400">
                    {userName}
                  </div>
                  <button
                    onClick={() => {
                      onLogout?.();
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-white/5 rounded-lg transition-colors"
                  >
                    Đăng xuất
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    navigate("/login");
                    setIsMobileMenuOpen(false);
                  }}
                  className="block w-full text-left px-3 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-white/5 rounded-lg transition-colors"
                >
                  Đăng nhập
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
