import React from "react";
import { phaseLabel } from "@/lib/gameMeta";
import { ConnectionStatus } from "@/components/shared/ConnectionStatus";

interface HeaderBarProps {
  matchCode: string;
  phase?: string;
  phaseName?: string;
  isConnected: boolean;
  centerContent?: React.ReactNode;
  rightContent?: React.ReactNode;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  matchCode,
  phase,
  phaseName,
  isConnected,
  centerContent,
  rightContent,
}) => {
  const displayPhase = phaseLabel(phase, phaseName);

  return (
    <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-2.5 glass gap-2">
      {}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0 shrink-0">
        <h1 className="text-sm sm:text-lg font-bold text-foreground tracking-wide truncate">
          OLYMPIA CUSTOM
        </h1>
      </div>

      {}
      {centerContent && (
        <div className="flex items-center justify-center gap-1 sm:gap-2 flex-1 min-w-0">
          {centerContent}
        </div>
      )}

      {}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {matchCode && (
          <span className="hidden lg:inline text-xs sm:text-sm text-brand  truncate">
            {matchCode}
          </span>
        )}
        {displayPhase && (
          <span className="hidden xl:inline text-xs sm:text-sm text-foreground/70 truncate">
            • {displayPhase}
          </span>
        )}
        {rightContent}
        <ConnectionStatus isConnected={isConnected} />
      </div>
    </div>
  );
};
