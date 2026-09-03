import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Wifi, WifiOff, Trophy } from "lucide-react";

interface GameHeaderProps {
  matchCode?: string;
  matchName?: string;
  phase?: string;
  phaseName?: string;
  isConnected?: boolean;
  backTo?: string;
  backLabel?: string;
  rightContent?: React.ReactNode;
}

const PHASE_NAMES: Record<string, string> = {
  kdc: "Khởi Động Chung",
  kdr: "Khởi Động Cá Nhân",
  bp: "Bứt Phá",
  vdc: "Về Đích Chung",
  vdr: "Về Đích Cá Nhân",
  gm: "Giải Mã",
  waiting: "Sảnh Chờ",
};

export const GameHeader: React.FC<GameHeaderProps> = ({
  matchCode,
  matchName,
  phase,
  phaseName,
  isConnected = true,
  backTo,
  backLabel = "Quay lại",
  rightContent,
}) => {
  const navigate = useNavigate();
  const displayPhase = phaseName || (phase ? PHASE_NAMES[phase] : null);

  return (
    <header className="sticky top-0 z-40 bg-black/40 backdrop-blur-sm border-b border-white/10">
      <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5">
        {/* Left: Back button + match info */}
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 shrink-0">
          {backTo && (
            <button
              onClick={() => navigate(backTo)}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title={backLabel}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-blue-400 hidden sm:block" />
            <div className="min-w-0">
              {matchName && (
                <h1 className="text-sm sm:text-base font-bold text-white truncate">
                  {matchName}
                </h1>
              )}
              {matchCode && (
                <span className="text-xs text-gray-400 font-mono">
                  {matchCode}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Phase */}
        {displayPhase && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-sm text-white/70">•</span>
            <span className="text-sm text-blue-300 font-medium">
              {displayPhase}
            </span>
          </div>
        )}

        {/* Right: Custom content + connection */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {rightContent}
          <div
            className={`flex items-center gap-1.5 text-xs ${
              isConnected ? "text-green-400" : "text-red-400"
            }`}
          >
            {isConnected ? (
              <>
                <Wifi size={14} />
                <span className="hidden sm:inline">Connected</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span className="hidden sm:inline">Disconnected</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile phase indicator */}
      {displayPhase && (
        <div className="sm:hidden px-3 pb-2">
          <span className="text-xs text-blue-300 font-medium">
            {displayPhase}
          </span>
        </div>
      )}
    </header>
  );
};
