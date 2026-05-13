import React from "react";
import { Mic, KeyRound } from "lucide-react";
import PingIconStyle from "../shared/PingIconStyle";
import type { PlayerStatus } from "@/types/player";



interface APlayerBarProps {
    player: PlayerStatus;
    isActive: boolean;
    isCurrent?: boolean;
    isKeywordMode?: boolean;
    hasKeywordSubmission?: boolean;
    onClick?: (playerCode: string) => void;
    disabled?: boolean;
}



const APlayerBar: React.FC<APlayerBarProps> = ({ player, isActive, isCurrent, isKeywordMode, hasKeywordSubmission, onClick, disabled }) => {
    // Use a single border instead of nested rings to avoid double-outline visual glitches
    // If this player is the current responder, show a white border per design
    const borderClass = isCurrent ? "border-white" : (player.playerHasBuzzed ? "border-blue-500" : "border-blue-600");
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

    // Qualifier tie-breaker info (only shown when available)
    const hasTieBreaker = player.playerCorrectScore != null || player.playerAvgResponseTime != null;

    return (
        <div
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
                        {/* connection indicator */}
                        <span
                            title={player.playerConnected ? "Connected" : "Disconnected"}
                            className={`w-3 h-3 rounded-full shrink-0 ${player.playerConnected ? 'bg-blue-400' : 'bg-gray-600'}`}
                        />

                        {player.playerName && (
                            <span className="font-[SVN-Gratelos_Display] uppercase text-[14px] tablet:text-[16px] xl:text-[24px] font-extrabold flex items-center gap-2">
                                {player.playerName}
                                {/* Turn indicator icon (plain Mic, no red theme) */}
                                {isCurrent && (
                                    <Mic size={16} className="text-white shrink-0" />
                                )}
                                {/* Keyword submitted but not yet revealed */}
                                {hasKeywordSubmission && (
                                    <KeyRound size={16} className="text-yellow-400 shrink-0" />
                                )}
                                {/* Buzzer icon inline next to name */}
                                {player.playerHasBuzzed && (
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
                {/* Qualifier tie-breaker info */}
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
            <p className="flex font-[SVN-Gratelos_Display] text-[28px] tablet:text-[32px] xl:text-[50px] font-extrabold ml-2 xl:ml-4 items-center">
                {player.playerScore}
            </p>
        </div>
    );
};

export default APlayerBar;