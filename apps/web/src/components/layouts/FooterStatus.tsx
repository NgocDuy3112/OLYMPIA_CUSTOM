import React from "react";
import { Users, Clock, Activity } from "lucide-react";

interface FooterStatusProps {
  playerCount?: number;
  timer?: number;
  phase?: string;
  extraInfo?: React.ReactNode;
}

export const FooterStatus: React.FC<FooterStatusProps> = ({
  playerCount,
  timer,
  phase,
  extraInfo,
}) => {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2 bg-black/30 border-t border-white/10 text-xs text-white/60">
      {/* Left: Player count */}
      <div className="flex items-center gap-3 sm:gap-4">
        {playerCount !== undefined && (
          <div className="flex items-center gap-1.5">
            <Users size={12} />
            <span>{playerCount} thí sinh</span>
          </div>
        )}
        {phase && (
          <div className="hidden sm:flex items-center gap-1.5">
            <Activity size={12} />
            <span>{phase}</span>
          </div>
        )}
      </div>

      {/* Center: Timer */}
      {timer !== undefined && (
        <div className="flex items-center gap-1.5 font-mono">
          <Clock size={12} />
          <span
            className={
              timer <= 5 ? "timer-danger" : timer <= 10 ? "timer-warning" : ""
            }
          >
            {formatTime(timer)}
          </span>
        </div>
      )}

      {/* Right: Extra info */}
      <div>{extraInfo}</div>
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
