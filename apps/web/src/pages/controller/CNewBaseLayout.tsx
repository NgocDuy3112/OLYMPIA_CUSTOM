import React, { type ReactNode } from "react";
import CGameShell from "@/pages/controller/CGameShell";
import { PlayerPanel } from "@/components/shared/PlayerPanel";
import type { PlayerStatus } from "@/types/player";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { getMatchCode } from "@/utils/storage";

interface CNewBaseLayoutProps {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  playerActions?: ReactNode;
  players: PlayerStatus[];
  selectedPlayerCodes?: string[];
  onTogglePlayer?: (code: string) => void;
  playersSelectable?: boolean;
  playersDisabled?: boolean;
  onEditScore?: (playerCode: string, newScore: number) => void;
  questionCode?: string;
  onReviewRequested?: (reviewId: string) => void;
  playerHeader?: ReactNode;
}

const CNewBaseLayout: React.FC<CNewBaseLayoutProps> = ({
  children,
  actions,
  playerActions,
  players,
  selectedPlayerCodes = [],
  onTogglePlayer,
  playersSelectable = false,
  playersDisabled = false,
  onEditScore,
  questionCode,
  onReviewRequested,
  playerHeader,
}) => {
  const { sendMessage } = useGameWebSocket();

  return (
    <CGameShell voiceUser="mc">
      <div className="flex flex-col lg:flex-row flex-1 p-2 sm:p-3 lg:p-4 gap-3 lg:gap-4 overflow-hidden">
        {}
        <div className="flex-1 flex flex-col gap-3 lg:gap-4 overflow-y-auto min-w-0">
          {}
          {}
          <div>{children}</div>

          {}
          {(actions || playerActions) && (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {actions}
              {playerActions && (
                <>
                  <span
                    className="mx-1 hidden h-5 w-px bg-border sm:block"
                    aria-hidden
                  />
                  {playerActions}
                </>
              )}
            </div>
          )}

        </div>

        {}
        <div className="w-full lg:w-72 xl:w-80 flex flex-col gap-3 lg:gap-4 overflow-hidden shrink-0">
          {playerHeader}

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {players.map((player) => (
              <div key={player.playerCode} className="flex flex-col">
                <PlayerPanel
                  player={player}
                  isActive={
                    playersSelectable &&
                    selectedPlayerCodes.includes(player.playerCode)
                  }
                  isCurrent={
                    playersSelectable &&
                    selectedPlayerCodes.includes(player.playerCode)
                  }
                  onClick={onTogglePlayer}
                  disabled={playersDisabled}
                  onEditScore={onEditScore}
                  sendMessage={sendMessage}
                  matchCode={getMatchCode()}
                  questionCode={questionCode}
                  onReviewRequested={onReviewRequested}
                  showCameraControl
                  onCameraControl={(playerCode, enabled) => {
                    void sendMessage({
                      type: "camera_control",
                      target_user_code: playerCode,
                      enabled,
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

    </CGameShell>
  );
};

export default CNewBaseLayout;
