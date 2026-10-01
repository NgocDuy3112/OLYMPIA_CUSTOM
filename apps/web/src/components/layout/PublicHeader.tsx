import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Menu, X, LogIn, LogOut, User, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const showProfile = userRole === "player" || userRole === "spectator";
  const navLinks = [
    { label: "Giải đấu", path: "/" },
    { label: "Luật chơi", path: "/info/rules" },
    ...(showProfile ? [{ label: "Hồ sơ", path: "/profile" }] : []),
  ];

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const navItemClass = (active: boolean) =>
    active
      ? "text-white bg-white/10"
      : "text-gray-300 hover:text-white hover:bg-white/5";

  return (
    <header className="sticky top-0 z-40 bg-black/30 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2 px-2 shrink-0"
          >
            <Trophy size={20} className="text-blue-400" />
            <span className="text-sm sm:text-lg font-bold text-white tracking-wide">
              OLYMPIA CUSTOM
            </span>
          </Button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Button
                key={link.path}
                variant="ghost"
                onClick={() => navigate(link.path)}
                className={navItemClass(isActive(link.path))}
              >
                {link.label}
              </Button>
            ))}
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                {showProfile && (
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/profile")}
                    className="gap-2"
                  >
                    <User size={16} className="text-gray-400" />
                    <span className="text-sm text-white">{userName}</span>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onLogout}
                  title="Đăng xuất"
                >
                  <LogOut size={18} />
                </Button>
              </div>
            ) : (
              <Button
                variant="default"
                onClick={() => navigate("/login")}
                className="gap-2 bg-blue-600 hover:bg-blue-500"
              >
                <LogIn size={16} />
                <span>Đăng nhập</span>
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-black/50 backdrop-blur-sm">
          <div className="px-4 py-3 space-y-1">
            {navLinks.map((link) => (
              <Button
                key={link.path}
                variant="ghost"
                onClick={() => {
                  navigate(link.path);
                  setIsMobileMenuOpen(false);
                }}
                className={`block w-full justify-start text-left ${navItemClass(isActive(link.path))}`}
              >
                {link.label}
              </Button>
            ))}

            <div className="pt-2 mt-2 border-t border-white/10">
              {isAuthenticated ? (
                <>
                  <div className="px-3 py-2 text-sm text-gray-400">
                    {userName}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      onLogout?.();
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full justify-start text-left text-red-400 hover:text-red-300 hover:bg-white/5"
                  >
                    Đăng xuất
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    navigate("/login");
                    setIsMobileMenuOpen(false);
                  }}
                  className="block w-full justify-start text-left text-blue-400 hover:text-blue-300 hover:bg-white/5"
                >
                  Đăng nhập
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
