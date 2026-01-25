import React from "react";
import PingIconStyle from "../shared/PingIconStyle";
import { Circle } from "lucide-react";
import type { PlayerStatus } from "@/types/player";



interface APlayerBarProps {
    player: PlayerStatus;
    isActive: boolean;
    isCurrent?: boolean;
    isKeywordMode?: boolean;
}



const APlayerBar: React.FC<APlayerBarProps> = ({ player, isActive, isCurrent, isKeywordMode }) => {
    return (
        <div className={`flex justify-between ${isActive ? "bg-blue-600" : "bg-blue-900 ring-blue-600"} ring-4 ${player.playerHasBuzzed ? "ring-blue-600" : "ring-white-600"} rounded-xl text-white shadow-md px-4 py-3 w-full`}>
            <div className="flex flex-col flex-1">
                <p className="font-extrabold uppercase leading-tight">
                    {player.playerName && (
                        <span className="font-[SVN-Gratelos_Display] uppercase text-[24px] font-extrabold flex items-center">
                            {player.playerName}
                            <Circle className={`ml-3 ${isCurrent ? 'text-blue-400' : 'text-gray-600'}`} size={12} />
                        </span>
                    )}
                    {player.playerTimestamp != null && player.playerTimestamp != 0 && (
                        <span className="ml-3 text-[16px] font-normal text-white">
                            {player.playerTimestamp}
                        </span>
                    )}
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