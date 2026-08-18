/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { Mic, KeyRound, Pencil } from "lucide-react";
import PingIconStyle from "../shared/PingIconStyle";
import WifiSignal from "../shared/WifiSignal";
import type { PlayerStatus } from "@/types/player";
import { API_BASE_URL } from "@/configs";
import ScoreEditModal from "./ScoreEditModal";

interface APlayerCardProps {
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
  token?: string;
  matchCode?: string;
  sendMessage?: (msg: any) => void;
  isHovered?: boolean;
  isDimmed?: boolean;
  onHover?: (playerCode: string | null) => void;
  hoverDisabled?: boolean;
  accentColor?: string;
}

const APlayerCard: React.FC<APlayerCardProps> = ({
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
  token,
  matchCode,
  sendMessage,
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

  const [showEditModal, setShowEditModal] = useState(false);
  const [editScoreValue, setEditScoreValue] = useState(
    player.playerScore.toString(),
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [showQuestionScoreModal, setShowQuestionScoreModal] = useState(false);

  const handleEditScoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || !onEditScore) return;
    setEditScoreValue(player.playerScore.toString());
    setShowQuestionScoreModal(true);
  };

  const handleUpdateScore = async () => {
    const newScore = parseInt(editScoreValue, 10);
    if (isNaN(newScore) || !token || !matchCode) return;
    if (newScore % 5 !== 0) {
      alert("Điểm mới phải là bội số của 5.");
      return;
    }

    setIsUpdating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/scoreboard/adjust`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          match_code: matchCode,
          user_code: player.playerCode,
          new_score: newScore,
          reason: "Admin manually adjusted score",
        }),
      });

      const json = await res.json();
      if (res.ok && json.status === "success") {
        onEditScore?.(player.playerCode, newScore);
        if (sendMessage) {
          sendMessage({
            type: "player_score_updated",
            user_code: player.playerCode,
            new_total_score: newScore,
          });
        }
        setShowEditModal(false);
      } else {
        console.error("Failed to update score:", json);
        alert(json.detail ?? json.message ?? "Không thể cập nhật điểm.");
      }
    } catch (err) {
      console.error("Error updating score:", err);
      alert("Lỗi kết nối. Vui lòng thử lại.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleKeyDownModal = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleUpdateScore();
    } else if (e.key === "Escape") {
      setShowEditModal(false);
    }
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
        className={`flex flex-col items-center p-3 rounded-lg border-2 border-transparent transition duration-300 flex-1 min-h-35 shadow-sm cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
                    ${isDimmed ? "opacity-40" : ""} ${isHovered ? "ring-4 ring-cyan-300" : ""}
                    ${
                      isActive || isCurrent
                        ? "bg-blue-600 shadow-xl scale-100 ring-2 text-white ring-blue-300"
                        : "ring-2 ring-blue-600 bg-blue-900 text-blue-300"
                    } ${disabled ? "opacity-60 pointer-events-none" : ""}`}
      >
        {}
        <div className="flex items-center gap-2 w-full justify-center">
          <WifiSignal
            latencyMs={player.playerLatencyMs}
            connected={!!player.playerConnected}
            size={14}
          />
          <p className="font-[SVN-Gratelos_Display] text-[22px] xl:text-[26px] font-bold uppercase truncate text-center flex items-center gap-1">
            {player.playerName}
            {player.playerAfk && (
              <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
                AFK
              </span>
            )}
            {isCurrent && <Mic size={16} className="text-white shrink-0" />}
            {hasKeywordSubmission && (
              <>
                <KeyRound size={14} className="text-white-400 shrink-0" />
                {showClueCount && typeof cluesOpened === "number" && (
                  <span className="text-[16px] font-normal text-white">
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
          <p className="font-[SVN-Gratelos_Display] text-[36px] xl:text-[44px] font-extrabold leading-none">
            {player.playerScore}
          </p>
          {onEditScore && !disabled && (
            <button
              onClick={handleEditScoreClick}
              className="p-1 rounded hover:bg-blue-700 transition-colors text-blue-300 hover:text-white"
              title="Sửa điểm"
              type="button"
            >
              <Pencil size={16} />
            </button>
          )}
        </div>

        {}
        <div className="mt-1 text-center min-h-6 flex flex-col items-center justify-center w-full">
          {player.playerLastAnswer && player.playerLastAnswer !== "---" && (
            <p className="text-[14px] font-bold text-white uppercase">
              {player.playerLastAnswer}
            </p>
          )}
          {player.playerTimestamp != null && player.playerTimestamp !== 0 && (
            <p className="text-[12px] text-white/80">
              {player.playerTimestamp.toFixed(3)}s
            </p>
          )}
        </div>
      </div>

      {}
      <ScoreEditModal
        open={showQuestionScoreModal}
        playerCode={player.playerCode}
        playerName={player.playerName}
        matchCode={matchCode ?? ""}
        token={token ?? ""}
        currentScore={player.playerScore}
        onClose={() => setShowQuestionScoreModal(false)}
        onSaved={(score) => {
          onEditScore?.(player.playerCode, score);
          setShowQuestionScoreModal(false);
        }}
      />
      {false && showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div
            className="bg-blue-950 border border-blue-700 rounded-xl p-6 w-full max-w-sm shadow-2xl"
            onKeyDown={handleKeyDownModal}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-blue-200">Sửa điểm</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-blue-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-blue-300 mb-4">
              {player.playerName} ({player.playerCode})
            </p>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-blue-400">
                Điểm mới (bội số của 5)
              </label>
              <input
                type="number"
                step={5}
                value={editScoreValue}
                onChange={(e) => setEditScoreValue(e.target.value)}
                className="px-3 py-2 rounded-lg bg-blue-900 border border-blue-600 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div className="flex gap-3 mt-6 justify-end">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={handleUpdateScore}
                disabled={isUpdating}
                className="px-4 py-2 rounded-lg bg-white-600 hover:bg-white-500 disabled:opacity-50 text-sm font-semibold transition-colors"
              >
                {isUpdating ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default APlayerCard;
