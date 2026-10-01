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
      ? "text-foreground bg-accent"
      : "text-foreground/80 hover:text-foreground hover:bg-accent/50";

  return (
    <header className="sticky top-0 z-40 bg-background/30 backdrop-blur-sm border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="gap-2 px-2 shrink-0"
          >
            <Trophy size={20} className="text-brand" />
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
                    <User size={16} className="text-muted-foreground" />
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
                className="gap-2 bg-primary hover:bg-primary/90"
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
        <div className="md:hidden border-t border-border bg-background/50 backdrop-blur-sm">
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

            <div className="pt-2 mt-2 border-t border-border">
              {isAuthenticated ? (
                <>
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {userName}
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      onLogout?.();
                      setIsMobileMenuOpen(false);
                    }}
                    className="block w-full justify-start text-left text-destructive hover:text-destructive/80 hover:bg-accent/50"
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
                  className="block w-full justify-start text-left text-brand hover:text-brand/80 hover:bg-accent/50"
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
