import React from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface PhaseNavigationProps {
  matchCode: string;
  currentPhase: string;
  disabled?: boolean;
  onNavigate?: (path: string) => void;
}

interface PhaseTab {
  id: string;
  label: string;
  shortLabel: string;
  path: string;
}

const PHASES: PhaseTab[] = [
  { id: "waiting", label: "Sảnh Chờ", shortLabel: "Chờ", path: "/waiting" },
  { id: "kdc", label: "Khởi Động Chung", shortLabel: "KĐC", path: "/kdc" },
  { id: "kdr", label: "Khởi Động Riêng", shortLabel: "KĐR", path: "/kdr" },
  { id: "bp", label: "Bứt Phá", shortLabel: "BP", path: "/bp" },
  { id: "vdc", label: "Về Đích Chung", shortLabel: "VĐC", path: "/vdc/pick" },
  { id: "vdr", label: "Về Đích Riêng", shortLabel: "VĐR", path: "/vdr/pick" },
  { id: "gm", label: "Giải Mã", shortLabel: "GM", path: "/gm" },
];

export const PhaseNavigation: React.FC<PhaseNavigationProps> = ({
  matchCode,
  currentPhase,
  disabled = false,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handlePhaseClick = (phase: PhaseTab) => {
    if (disabled || phase.id === currentPhase) return;

    // Determine role prefix from current path
    const rolePrefix = location.pathname.startsWith("/admin")
      ? "/admin"
      : location.pathname.startsWith("/mc")
        ? "/mc"
        : "/player";

    const targetPath = `${rolePrefix}${phase.path}/${matchCode}`;

    if (onNavigate) {
      onNavigate(targetPath);
    } else {
      navigate(targetPath);
    }
  };

  return (
    <nav className="flex gap-1 px-2 py-1.5 bg-black/20 overflow-x-auto scrollbar-hide">
      {PHASES.map((phase) => {
        const isActive =
          phase.id === currentPhase ||
          (phase.id === "vdc" && currentPhase === "vdc/pick") ||
          (phase.id === "vdr" && currentPhase === "vdr/pick");

        return (
          <button
            key={phase.id}
            onClick={() => handlePhaseClick(phase)}
            disabled={disabled || isActive}
            className={`
              px-2 py-1.5 sm:px-3 sm:py-2 rounded text-xs sm:text-sm font-medium transition-all whitespace-nowrap touch-target-sm
              ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
              }
              ${disabled && !isActive ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            `}
          >
            <span className="hidden sm:inline">{phase.label}</span>
            <span className="sm:hidden">{phase.shortLabel}</span>
          </button>
        );
      })}
    </nav>
  );
};
