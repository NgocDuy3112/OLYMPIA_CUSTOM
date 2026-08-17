import React, { useState } from "react";
import { Mic, KeyRound, Pencil, Star, Shield } from "lucide-react";
import PingIconStyle from "../shared/PingIconStyle";
import WifiSignal from "../shared/WifiSignal";
import type { PlayerStatus } from "@/types/player";
import { API_BASE_URL } from "@/configs";
import ScoreEditModal from "./ScoreEditModal";

interface APlayerBarProps {
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
    token?: string;
    matchCode?: string;
    sendMessage?: (msg: any) => void;

    cluesOpened?: number;

    showClueCount?: boolean;
}

const APlayerBar: React.FC<APlayerBarProps> = ({ player, isActive, isCurrent, isKeywordMode, hasKeywordSubmission, playerPower, isBuzzerWinner, onClick, disabled, disableReason, onEditScore, token, matchCode, sendMessage, cluesOpened, showClueCount }) => {

    const shouldShowPingIcon = isBuzzerWinner ?? !!player.playerHasBuzzed;
    const borderClass = isCurrent ? "border-white" : (shouldShowPingIcon ? "border-blue-500" : "border-blue-600");
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

    const [showEditModal, setShowEditModal] = useState(false);
    const [editScoreValue, setEditScoreValue] = useState(player.playerScore.toString());
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

    const hasTieBreaker = player.playerCorrectScore != null || player.playerAvgResponseTime != null;

    return (
        <>
            <div
                title={disabled ? (disableReason ?? "Không khả dụng") : undefined}
                role={disabled ? undefined : "button"}
                tabIndex={disabled ? -1 : 0}
                onClick={disabled ? undefined : handleClick}
                onKeyDown={disabled ? undefined : handleKeyDown}
                aria-disabled={disabled ?? false}
                className={`flex justify-between ${isActive ? "bg-blue-600" : "bg-blue-900"} border-2 ${borderClass} rounded-xl text-white shadow-md px-3 py-2 xl:px-4 xl:py-3 w-full ${disabled ? 'opacity-60 pointer-events-none' : 'cursor-pointer'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
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
                                    {playerPower === 'star' && (
                                        <Star size={16} className="text-white-400 shrink-0" />
                                    )}
                                    {playerPower === 'shield' && (
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

                            {player.playerTimestamp != null && player.playerTimestamp != 0 && (
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
                            {player.playerCorrectScore != null && player.playerAvgResponseTime != null && (
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
                </div>
            </div>

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
                            <h2 className="flex items-center gap-2 text-lg font-bold text-blue-200">
                                <Pencil size={18} /> Sửa điểm cho {player.playerName}
                            </h2>
                            <button
                                onClick={() => setShowEditModal(false)}
                                className="p-1 rounded hover:bg-blue-800 transition-colors text-blue-400"
                                disabled={isUpdating}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>

                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium text-blue-300 mb-2">
                                    Điểm mới
                                </label>
                                <input
                                    type="number"
                                    value={editScoreValue}
                                    onChange={(e) => setEditScoreValue(e.target.value)}
                                    className="w-full px-4 py-2 bg-blue-900 border border-blue-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-lg font-bold"
                                    autoFocus
                                    disabled={isUpdating}
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowEditModal(false)}
                                    className="flex-1 px-4 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
                                    disabled={isUpdating}
                                >
                                    Hủy
                                </button>
                                <button
                                    onClick={handleUpdateScore}
                                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 font-medium transition-colors disabled:opacity-50"
                                    disabled={isUpdating}
                                >
                                    {isUpdating ? "Đang cập nhật..." : "Cập nhật"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default APlayerBar;