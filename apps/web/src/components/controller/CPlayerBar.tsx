import React, { useState } from "react";
import { Mic, KeyRound, Pencil, Star, Shield, Send } from "lucide-react";
import PingIconStyle from "../shared/PingIconStyle";
import WifiSignal from "../shared/WifiSignal";
import type { PlayerStatus } from "@/types/player";
import { requestScoreReview } from "@/api/scoreReviews";
import CScoreEditModal from "@/components/controller/CScoreEditModal";

interface CPlayerBarProps {
  player: PlayerStatus;
  isActive: boolean;
  isCurrent?: boolean;
  isKeywordMode?: boolean;
  hasKeywordSubmission?: boolean;
  playerPower?: "star" | "shield" | null;
  isBuzzerWinner?: boolean;
  onClick?: (playerCode: string) => void;
  disabled?: boolean;

  disableReason?: string;
  onEditScore?: (playerCode: string, newScore: number) => void;
  matchCode?: string;
  sendMessage?: (msg: WebSocketPayload) => void;
  questionCode?: string;
  onReviewRequested?: (reviewId: string) => void;

  cluesOpened?: number;

  showClueCount?: boolean;
}

const CPlayerBar: React.FC<CPlayerBarProps> = ({
  player,
  isActive,
  isCurrent,
  isKeywordMode,
  hasKeywordSubmission,
  playerPower,
  isBuzzerWinner,
  onClick,
  disabled,
  disableReason,
  onEditScore,
  matchCode,
  sendMessage,
  questionCode,
  onReviewRequested,
  cluesOpened,
  showClueCount,
}) => {
  const shouldShowPingIcon = isBuzzerWinner ?? !!player.playerHasBuzzed;
  const borderClass = isCurrent
    ? "border-white"
    : shouldShowPingIcon
      ? "border-blue-500"
      : "border-blue-600";
  const handleClick = () => {
    if (disabled) return;
    onClick?.(player.playerCode);
  };
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick?.(player.playerCode);
    }
  };

  const [isRequestingReview, setIsRequestingReview] = useState(false);

  const handleRequestReview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !matchCode || !questionCode || isRequestingReview) return;
    setIsRequestingReview(true);
    try {
      const data = await requestScoreReview(matchCode, questionCode, [
        { userCode: player.playerCode, answerText: player.playerLastAnswer ?? "" },
      ]);
      onReviewRequested?.(data.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Không gửi duyệt được.");
    } finally {
      setIsRequestingReview(false);
    }
  };
  const [showQuestionScoreModal, setShowQuestionScoreModal] = useState(false);

  const handleEditScoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !onEditScore) return;
    setShowQuestionScoreModal(true);
  };

  const hasTieBreaker =
    player.playerCorrectScore != null || player.playerAvgResponseTime != null;

  return (
    <>
      <div
        title={disabled ? (disableReason ?? "Không khả dụng") : undefined}
        role={disabled ? undefined : "button"}
        tabIndex={disabled ? -1 : 0}
        onClick={disabled ? undefined : handleClick}
        onKeyDown={disabled ? undefined : handleKeyDown}
        aria-disabled={disabled ?? false}
        className={`flex justify-between ${isActive ? "bg-blue-600" : "bg-blue-900"} border-2 ${borderClass} rounded-xl text-white shadow-md px-3 py-2 xl:px-4 xl:py-3 w-full ${disabled ? "opacity-60 pointer-events-none" : "cursor-pointer"} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
      >
        <div className="flex flex-col flex-1">
          <p className="font-extrabold uppercase leading-tight">
            <span className="flex items-center gap-4">
              <WifiSignal
                latencyMs={player.playerLatencyMs}
                connected={!!player.playerConnected}
                size={16}
              />

              {player.playerName && (
                <span className="font-[SVN-Gratelos_Display] uppercase text-[14px] tablet:text-[16px] xl:text-[24px] font-extrabold flex items-center gap-2">
                  {player.playerName}
                  {player.playerAfk && (
                    <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                      AFK
                    </span>
                  )}
                  {playerPower === "star" && (
                    <Star size={16} className="text-white-400 shrink-0" />
                  )}
                  {playerPower === "shield" && (
                    <Shield size={16} className="text-white-400 shrink-0" />
                  )}
                  {isCurrent && (
                    <Mic size={16} className="text-white shrink-0" />
                  )}
                  {hasKeywordSubmission && (
                    <>
                      <KeyRound size={16} className="text-white-400 shrink-0" />
                      {showClueCount && typeof cluesOpened === "number" && (
                        <span className="text-[16px] tablet:text-[18px] xl:text-[22px] font-normal text-white">
                          {cluesOpened}
                        </span>
                      )}
                    </>
                  )}
                  {shouldShowPingIcon && (
                    <PingIconStyle isKeywordMode={!!isKeywordMode} />
                  )}
                </span>
              )}

              {player.playerTimestamp != null &&
                player.playerTimestamp != 0 && (
                  <span className="text-[11px] tablet:text-[13px] xl:text-[16px] font-normal text-white">
                    {player.playerTimestamp.toFixed(3)}
                  </span>
                )}
            </span>
          </p>
          <p className="text-[12px] tablet:text-[14px] xl:text-[18px] mt-1 font-medium leading-snug">
            {player.playerLastAnswer?.toUpperCase() ?? ""}
          </p>
          {hasTieBreaker && (
            <p className="text-[12px] mt-1 text-blue-200 font-normal">
              {player.playerCorrectScore != null && (
                <span>Đúng: {player.playerCorrectScore} điểm</span>
              )}
              {player.playerCorrectScore != null &&
                player.playerAvgResponseTime != null && (
                  <span className="mx-2">|</span>
                )}
              {player.playerAvgResponseTime != null && (
                <span>T.Bình: {player.playerAvgResponseTime.toFixed(2)}s</span>
              )}
            </p>
          )}
        </div>
        <div className="flex font-[SVN-Gratelos_Display] text-[28px] tablet:text-[32px] xl:text-[50px] font-extrabold ml-2 xl:ml-4 items-center gap-2">
          {player.playerScore}
          {sendMessage && !disabled && (
            <button
              type="button"
              title={player.playerAfk ? "Bật lại thí sinh" : "Đánh dấu AFK"}
              onClick={(event) => {
                event.stopPropagation();
                void sendMessage({
                  type: "player_afk_updated",
                  user_code: player.playerCode,
                  status: player.playerAfk ? "active" : "afk",
                  afk: !player.playerAfk,
                });
              }}
              className={`rounded px-2 py-1 text-[10px] font-bold transition-colors ${player.playerAfk ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-amber-600 hover:bg-amber-500 text-white"}`}
            >
              {player.playerAfk ? "BẬT LẠI" : "AFK"}
            </button>
          )}
          {onEditScore && !disabled && (
            <button
              onClick={handleEditScoreClick}
              className="p-1 rounded hover:bg-blue-700 transition-colors text-blue-300 hover:text-white"
              title="Sửa điểm"
              type="button"
            >
              <Pencil size={18} />
            </button>
          )}
          {questionCode && matchCode && !disabled && (
            <button
              onClick={(e) => void handleRequestReview(e)}
              disabled={isRequestingReview}
              className="p-1 rounded hover:bg-amber-600 transition-colors text-amber-300 hover:text-white disabled:opacity-50"
              title="Gửi duyệt đáp án qua Discord"
              type="button"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </div>

      <CScoreEditModal
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

export default CPlayerBar;
