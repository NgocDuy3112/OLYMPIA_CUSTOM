import React from "react";
import PingIconStyle from "../shared/PingIconStyle";
import type { PlayerStatus } from "@/types/player";



interface APlayerBarProps {
    player: PlayerStatus;
    isActive: boolean;
    isCurrent?: boolean;
    isKeywordMode?: boolean;
    onClick?: (playerCode: string) => void;
    disabled?: boolean;
}



const APlayerBar: React.FC<APlayerBarProps> = ({ player, isActive, isCurrent, isKeywordMode, onClick, disabled }) => {
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

    return (
        <div
            role={disabled ? undefined : "button"}
            tabIndex={disabled ? -1 : 0}
            onClick={disabled ? undefined : handleClick}
            onKeyDown={disabled ? undefined : handleKeyDown}
            aria-disabled={disabled ?? false}
            className={`flex justify-between ${isActive ? "bg-blue-600" : "bg-blue-900"} border-2 ${borderClass} rounded-xl text-white shadow-md px-4 py-3 w-full ${disabled ? 'opacity-60 pointer-events-none' : 'cursor-pointer'} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400`}
        >
            <div className="flex flex-col flex-1">
                <p className="font-extrabold uppercase leading-tight">
                    <span className="flex items-center gap-4">
                        {/* connection indicator */}
                        <span
                            title={player.playerConnected ? "Connected" : "Disconnected"}
                            className={`w-3 h-3 rounded-full shrink-0 ${player.playerConnected ? 'bg-green-400' : 'bg-gray-600'}`}
                        />

                        {player.playerName && (
                            <span className="font-[SVN-Gratelos_Display] uppercase text-[24px] font-extrabold flex items-center">
                                {player.playerName}
                            </span>
                        )}

                        {player.playerTimestamp != null && player.playerTimestamp != 0 && (
                            <span className="text-[16px] font-normal text-white">
                                {player.playerTimestamp.toFixed(3)}
                            </span>
                        )}
                    </span>
                </p>
                {player.playerHasBuzzed && (
                    <p className="text-[18px] mt-1 font-medium leading-snug">
                        <PingIconStyle isKeywordMode={!!isKeywordMode} />
                    </p>
                )}
                <p className="text-[18px] mt-1 font-medium leading-snug">
                    {player.playerLastAnswer?.toUpperCase() ?? ""}
                </p>
            </div>
            <p className="flex font-[SVN-Gratelos_Display] text-[50px] font-extrabold ml-4 items-center">
                {player.playerScore}
            </p>
        </div>
    );
};

export default APlayerBar;