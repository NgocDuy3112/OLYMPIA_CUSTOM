import React from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ShellHeader } from "./ShellHeader";
import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/shared/ConnectionStatus";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoundNavigator } from "@/hooks/useRoundNavigator";
import { phaseLabel } from "@/lib/gameMeta";
import { getPhaseFromPath } from "@/utils/phase";
import { getMatchCode } from "@/utils/storage";

interface ControllerHeaderProps {
  userName?: string;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
}

export const ControllerHeader: React.FC<ControllerHeaderProps> = (props) => {
  const location = useLocation();
  const { isConnected } = useGameWebSocket();
  const matchCode = getMatchCode();
  const { next, prev, nextShort, prevShort, goNext, goPrev } =
    useRoundNavigator(matchCode);

  if (!matchCode) return <ShellHeader roleLabel="Controller" {...props} />;

  const displayPhase = phaseLabel(
    getPhaseFromPath(location.pathname),
    undefined,
  );

  return (
    <ShellHeader
      roleLabel="Controller"
      {...props}
      center={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void goPrev()}
            disabled={!prev}
            className="gap-1 disabled:opacity-40 h-8"
            title={prev ? `Vòng trước: ${prevShort}` : "Đã ở vòng đầu"}
          >
            <ChevronLeft size={14} />
            <span className="hidden sm:inline">Trước</span>
          </Button>
          <Button
            size="sm"
            onClick={() => void goNext()}
            disabled={!next}
            className="gap-1 disabled:opacity-40 h-8"
            title={next ? `Vòng sau: ${nextShort}` : undefined}
          >
            {nextShort ?? "Kết thúc"}
            <ChevronRight size={14} />
          </Button>
        </div>
      }
      end={
        <>
          <span className="hidden lg:inline text-xs text-brand truncate">
            {matchCode}
          </span>
          {displayPhase && (
            <span className="hidden xl:inline text-xs text-foreground/70 truncate">
              • {displayPhase}
            </span>
          )}
          <ConnectionStatus isConnected={isConnected} />
        </>
      }
    />
  );
};
