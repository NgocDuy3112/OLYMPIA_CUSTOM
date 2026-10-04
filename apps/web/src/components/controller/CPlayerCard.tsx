import React, { useState } from "react";
import { Mic, KeyRound, Pencil } from "lucide-react";
import PingIconStyle from "../shared/PingIconStyle";
import WifiSignal from "../shared/WifiSignal";
import type { PlayerStatus } from "@/types/player";
import CScoreEditSidePanel from "@/components/controller/CScoreEditSidePanel";
import { Button } from "@/components/ui/button";

interface CPlayerCardProps {
  player: PlayerStatus;
  isActive?: boolean;
  isCurrent?: boolean;
  isKeywordMode?: boolean;
  hasKeywordSubmission?: boolean;
  cluesOpened?: number;
  showClueCount?: boolean;
  onClick?: (playerCode: string) => void;
  disabled?: boolean;
  onEditScore?: (playerCode: string, newScore: number) => void;
  matchCode?: string;
  sendMessage?: (msg: any) => void;
  isHovered?: boolean;
  isDimmed?: boolean;
  onHover?: (playerCode: string | null) => void;
  hoverDisabled?: boolean;
  accentColor?: string;
}

const CPlayerCard: React.FC<CPlayerCardProps> = ({
  player,
  isActive,
  isCurrent,
  isKeywordMode,
  hasKeywordSubmission,
  cluesOpened,
  showClueCount,
  onClick,
  disabled,
  onEditScore,
  matchCode,
  isHovered,
  isDimmed,
  onHover,
  hoverDisabled,
  accentColor,
}) => {
  const handleClick = () => {
    if (disabled) return;
    onClick?.(player.playerCode);
  };

  const [showQuestionScoreModal, setShowQuestionScoreModal] = useState(false);

  const handleEditScoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !onEditScore) return;
    setShowQuestionScoreModal(true);
  };

  return (
    <>
      <div
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : handleClick}
        onMouseEnter={() => !hoverDisabled && onHover?.(player.playerCode)}
        onMouseLeave={() => !hoverDisabled && onHover?.(null)}
        aria-disabled={disabled ?? false}
        style={{
          borderColor: accentColor,
          ["--tw-ring-color" as string]: accentColor,
        }}
        className={`flex flex-col items-center p-3 rounded-lg border-2 border-transparent transition duration-300 flex-1 min-h-35 shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                    ${isDimmed ? "opacity-40" : ""} ${isHovered ? "ring-4 ring-cyan-300" : ""}
                    ${
                      isActive || isCurrent
                        ? "bg-primary shadow-xl scale-100 ring-2 text-primary-foreground ring-brand"
                        : "ring-2 ring-primary bg-primary/40 text-brand"
                    } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {}
        <div className="flex items-center gap-2 w-full justify-center">
          <WifiSignal
            latencyMs={player.playerLatencyMs}
            connected={!!player.playerConnected}
            size={14}
          />
          <p className="font-display text-[22px] xl:text-[26px] font-bold uppercase truncate text-center flex items-center gap-1">
            {player.playerName}
            {player.playerAfk && (
              <span className="rounded bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                AFK
              </span>
            )}
            {isCurrent && <Mic size={16} className="text-foreground shrink-0" />}
            {hasKeywordSubmission && (
              <>
                <KeyRound size={14} className="text-foreground-400 shrink-0" />
                {showClueCount && typeof cluesOpened === "number" && (
                  <span className="text-[16px] font-normal text-foreground">
                    {cluesOpened}
                  </span>
                )}
              </>
            )}
            {player.playerHasBuzzed && (
              <PingIconStyle isKeywordMode={!!isKeywordMode} />
            )}
          </p>
        </div>

        {}
        <div className="flex items-center gap-2 mt-2">
          <p className="font-display text-[36px] xl:text-[44px] font-extrabold leading-none">
            {player.playerScore}
          </p>
          {onEditScore && !disabled && (
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={handleEditScoreClick}
              className="rounded hover:bg-accent text-brand hover:text-foreground"
              title="Sửa điểm"
              type="button"
            >
              <Pencil size={16} />
            </Button>
          )}
        </div>

        {}
        <div className="mt-1 text-center min-h-6 flex flex-col items-center justify-center w-full">
          {player.playerLastAnswer && player.playerLastAnswer !== "---" && (
            <p className="text-[14px] font-bold text-foreground uppercase">
              {player.playerLastAnswer}
            </p>
          )}
          {player.playerTimestamp != null && player.playerTimestamp !== 0 && (
            <p className="text-[12px] text-foreground/80">
              {player.playerTimestamp.toFixed(3)}s
            </p>
          )}
        </div>
      </div>

      {}
      <CScoreEditSidePanel
        open={showQuestionScoreModal}
        playerCode={player.playerCode}
        playerName={player.playerName}
        matchCode={matchCode ?? ""}
        currentScore={player.playerScore}
        onClose={() => setShowQuestionScoreModal(false)}
        onSaved={(score) => {
          onEditScore?.(player.playerCode, score);
          setShowQuestionScoreModal(false);
        }}
      />
    </>
  );
};

export default CPlayerCard;
