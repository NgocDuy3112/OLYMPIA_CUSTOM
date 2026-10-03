/**
 * CGameShell — khung màn vòng thi của Controller/MC.
 * Bắt chước cấu trúc Player: HeaderBar (mã trận · vòng · WS) + stepper
 * "vòng trước/sau" — controller tự điều khiển thay vì chờ admin push navigate.
 */
import React, { type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeaderBar } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { VoicePublisher } from "@/components/shared/VoicePublisher";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useRoundNavigator } from "@/hooks/useRoundNavigator";
import { getPhaseFromPath } from "@/utils/phase";
import { getMatchCode } from "@/utils/storage";

interface CGameShellProps {
  /** User code to publish MC voice for (omit to disable). */
  voiceUser?: string | null;
  children: ReactNode;
}

export const CGameShell: React.FC<CGameShellProps> = ({
  voiceUser,
  children,
}) => {
  const location = useLocation();
  const { isConnected } = useGameWebSocket();
  const matchCode = getMatchCode();
  const { next, prev, nextShort, prevShort, goNext, goPrev } =
    useRoundNavigator(matchCode);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <HeaderBar
        matchCode={matchCode}
        phase={getPhaseFromPath(location.pathname)}
        isConnected={isConnected}
        centerContent={
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void goPrev()}
              disabled={!prev}
              className="gap-1 disabled:opacity-40"
              title={prev ? `Vòng trước: ${prevShort}` : "Đã ở vòng đầu"}
            >
              <ChevronLeft size={14} />
              <span className="hidden sm:inline">Trước</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void goNext()}
              disabled={!next}
              className="gap-1 disabled:opacity-40"
              title={next ? `Vòng sau: ${nextShort}` : undefined}
            >
              {nextShort ?? "Kết thúc"}
              <ChevronRight size={14} />
            </Button>
          </div>
        }
      />
      {voiceUser ? <VoicePublisher userCode={voiceUser} /> : null}
      {children}
    </div>
  );
};

export default CGameShell;
