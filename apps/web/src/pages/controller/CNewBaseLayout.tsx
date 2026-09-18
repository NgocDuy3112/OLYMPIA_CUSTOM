/**
 * CNewBaseLayout — Simplified controller page layout.
 *
 * Two-column: main content (left) + player sidebar (right).
 * Responsive: stacks vertically on tablet, sidebar collapses on mobile.
 */
import React, { type ReactNode } from "react";
import CGameShell from "@/pages/controller/CGameShell";
import { PlayerPanel } from "@/components/shared/PlayerPanel";
import type { PlayerStatus } from "@/types/player";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { getMatchCode } from "@/utils/storage";

interface CNewBaseLayoutProps {
  /** Round title displayed above question board */
  title: string;
  /** Main content area */
  children: ReactNode;
  /** Action buttons below content */
  actions?: ReactNode;
  /** Additional buttons for the player sidebar */
  playerActions?: ReactNode;
  /** Player list */
  players: PlayerStatus[];
  /** Selected player codes for scoring */
  selectedPlayerCodes?: string[];
  /** Toggle player selection */
  onTogglePlayer?: (code: string) => void;
  /** Whether players are clickable */
  playersSelectable?: boolean;
  /** Whether player selection is disabled */
  playersDisabled?: boolean;
  /** Edit score callback */
  onEditScore?: (playerCode: string, newScore: number) => void;
  /** Current question code — enables per-player Gui duyet review */
  questionCode?: string;
  /** Fired after a score review is created */
  onReviewRequested?: (reviewId: string) => void;
  /** Additional content above player list */
  playerHeader?: ReactNode;
}

const CNewBaseLayout: React.FC<CNewBaseLayoutProps> = ({
  title,
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
        {/* Main content */}
        <div className="flex-1 flex flex-col gap-3 lg:gap-4 overflow-y-auto min-w-0">
          {/* Title */}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white text-center uppercase tracking-wide">
            {title}
          </h1>

          {/* Content */}
          <div className="flex-1">{children}</div>

          {/* Actions */}
          {actions && (
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {actions}
            </div>
          )}
        </div>

        {/* Player sidebar */}
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

          {playerActions && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {playerActions}
            </div>
          )}
        </div>
      </div>
    </CGameShell>
  );
};

export default CNewBaseLayout;
