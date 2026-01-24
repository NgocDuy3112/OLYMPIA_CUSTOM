import React from "react";
import { Bell } from "lucide-react";
import type { PlayerStatus } from "@/types/player";


    
interface APlayerBarProps {
    player: PlayerStatus;
    isActive: boolean;
}


const PlayerBar: React.FC<APlayerBarProps> = ({ player, isActive }) => {
    return (
        <div className={`flex justify-between ${isActive ? "bg-red-600" : "bg-red-900 ring-red-600"} ring-4 ${player.playerHasBuzzed ? "ring-red-600" : "ring-white-600"} rounded-xl text-white shadow-md px-4 py-3 w-full`}>
            <div className="flex flex-col flex-1">
                <p className="font-extrabold uppercase leading-tight">
                    {player.playerName && (
                        <span className="font-[SVN-Gratelos_Display] uppercase text-[24px] font-extrabold">
                            {player.playerName}
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
                        <Bell size={40} />
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

export default PlayerBar;