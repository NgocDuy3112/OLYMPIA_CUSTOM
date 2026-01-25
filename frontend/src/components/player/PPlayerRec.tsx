import React from "react";
import { Bell } from "lucide-react";
import type { PlayerStatus } from "@/types/player";


interface PPlayerRecProps {
    player: PlayerStatus;
    isCurrent: boolean;
}



const PPlayerRec: React.FC<PPlayerRecProps> = ({ player, isCurrent }) => {
    const answerContent = player.playerLastAnswer?.trim() ?? '';
    const isAnswered = answerContent !== '---' && answerContent !== '';
    let displayAnswer: string | null = null;
    let displayTime: string | null = null;

    let answerClasses = 'text-white/60';
    const showPingBell = (player.playerHasBuzzed === true);
    let content: React.ReactNode;
    if (showPingBell) {
        content = (
            <>
                <p className={`px-2 rounded-md font-bold text-wrap ${isAnswered ? answerClasses : 'text-white'}`}>
                    <Bell size={40}/>
                </p>
            </>
        );
    } else if (isAnswered) {
        displayAnswer = answerContent.toUpperCase();
        if (typeof player.playerTimestamp === 'number') {
            displayTime = player.playerTimestamp.toFixed(3);
        }
        answerClasses = 'text-white';
        content = (
            <>
                <p className={`px-2 rounded-md text-[18px] font-bold text-wrap ${isAnswered ? answerClasses : 'text-white'}`}>
                    {displayAnswer}
                </p>

                {displayTime && (
                    <p className="text-[15px] font-semibold text-white px-2 rounded-md shadow-inner">
                        {displayTime}
                    </p>
                )}
            </>
        );
    } else {content = null;}

    return (
        <div
            key={player.playerCode}
            className={`flex flex-col items-center p-2 rounded-lg transition duration-300 w-1/4 ml-1 mr-1 min-h-31.25 shadow-sm
                ${isCurrent
                    ? 'bg-blue-600 shadow-xl scale-100 ring-4 text-white ring-blue-300'
                    : 'ring-2 ring-blue-600 bg-blue-900 text-blue-300'
                }`}
        >
            <div className="flex justify-between items-center w-full">
                <p className="text-[28px] font-bold font-[SVN-Gratelos_Display] uppercase truncate text-left max-w-[80%]">
                    {player.playerName}
                </p>
                <div className="flex items-center">
                    <p className="text-[32px] font-[SVN-Gratelos_Display] font-extrabold">
                        {player.playerScore}
                    </p>
                </div>
            </div>

            <div className="mt-2 text-center min-h-10 flex flex-col items-center justify-center w-full mx-auto">
                {content}
            </div>
        </div>
    )
}


export default PPlayerRec;
