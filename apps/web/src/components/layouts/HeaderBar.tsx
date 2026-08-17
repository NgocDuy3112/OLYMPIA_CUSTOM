import React from "react";
import { Wifi, WifiOff } from "lucide-react";

interface HeaderBarProps {
  matchCode: string;
  phase?: string;
  phaseName?: string;
  isConnected: boolean;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

const PHASE_NAMES: Record<string, string> = {
  kdc: "Khởi Động Chung",
  kdr: "Khởi Động Cá Nhân",
  bp: "Bứt Phá",
  vdc: "Về Đích Chung",
  vdr: "Về Đích Cá Nhân",
  gm: "Giải Mã",
  vl: "Vòng Loại",
  waiting: "Sảnh Chờ",
};

export const HeaderBar: React.FC<HeaderBarProps> = ({
  matchCode,
  phase,
  phaseName,
  isConnected,
  centerContent,
  rightContent,
}) => {
  const displayPhase = phaseName || (phase ? PHASE_NAMES[phase] : null);

  return (
    <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 bg-black/30 backdrop-blur-sm border-b border-white/10 gap-2">
      {/* Left: Match info */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 shrink-0">
        <h1 className="text-sm sm:text-lg font-bold text-white tracking-wide truncate">
          OLYMPIA CUSTOM
        </h1>
      </div>

      {/* Center: Navigation tabs */}
      {centerContent && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 flex-1 min-w-0">
          {centerContent}
        </div>
      )}

      {/* Right: Phase info + Connection status + custom content */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {matchCode && (
          <span className="hidden lg:inline text-xs sm:text-sm text-blue-300 font-mono truncate">
            {matchCode}
          </span>
        )}
        {displayPhase && (
          <span className="hidden xl:inline text-xs sm:text-sm text-white/70 truncate">
            • {displayPhase}
          </span>
        )}
        {rightContent}
        <div className={`flex items-center gap-1.5 text-xs ${isConnected ? "text-green-400" : "text-red-400"}`}>
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
  );
};
