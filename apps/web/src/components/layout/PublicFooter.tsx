import React from "react";
import { useNavigate } from "react-router-dom";

export const PublicFooter: React.FC = () => {
  const navigate = useNavigate();

  return (
    <footer className="border-t border-white/10 bg-black/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <p className="text-sm text-gray-400">
              © {new Date().getFullYear()} Olympia Custom
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Nền tảng thi đấu trực tuyến
            </p>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={() => navigate("/info/rules")}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Luật chơi
            </button>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
};
