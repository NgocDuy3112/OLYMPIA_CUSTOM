import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, LogOut, User, HelpCircle } from "lucide-react";

interface QAuthorHeaderProps {
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}

export const QAuthorHeader: React.FC<QAuthorHeaderProps> = ({
  userName,
  onLogout,
  onToggleSidebar,
}) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-black/40 backdrop-blur-sm border-b border-white/10">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleSidebar}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors lg:hidden"
          >
            <Menu size={20} />
          </button>
          <button
            onClick={() => navigate("/operator/qauthor/questions")}
            className="flex items-center gap-2"
          >
            <HelpCircle size={18} className="text-green-400" />
            <span className="text-sm sm:text-base font-bold text-white">
              QAUTHOR
            </span>
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <User size={16} className="text-gray-400" />
            <span className="text-sm text-white hidden sm:inline">
              {userName}
            </span>
          </button>

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-48 bg-[#12102e] border border-white/10 rounded-lg shadow-xl z-50">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-sm text-white">{userName}</p>
                  <p className="text-xs text-gray-400">Question Author</p>
                </div>
                <button
                  onClick={() => {
                    onLogout?.();
                    setIsMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-white/5 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Đăng xuất</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
