import React from "react";
import { Zap, Mic, KeyRound, Star, Shield } from "lucide-react";
import type { PlayerStatus } from "@/types/player";

interface PPlayerRecProps {
    player: PlayerStatus;
    isCurrent: boolean;
    isBuzzerWinner?: boolean;
    isHovered?: boolean;
    isDimmed?: boolean;
    onHover?: (playerCode: string | null) => void;
}

const PPlayerRec: React.FC<PPlayerRecProps> = ({ player, isCurrent, isBuzzerWinner, isHovered, isDimmed, onHover }) => {
    const answerContent = player.playerLastAnswer?.trim() ?? '';
    const isAnswered = answerContent !== '---' && answerContent !== '';
    let displayAnswer: string | null = null;
    let displayTime: string | null = null;

    let answerClasses = 'text-white/60';
    let content: React.ReactNode;
    if (isBuzzerWinner) {
        content = (
            <>
                <p className={`px-2 rounded-md font-bold text-wrap ${isAnswered ? answerClasses : 'text-white'}`}>
                    <Zap size={40}/>
                </p>
            </>
        );
    } else if (isAnswered) {
        displayAnswer = answerContent.toUpperCase();
        if (typeof player.playerTimestamp === 'number' && player.playerTimestamp !== 0) {
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
            onMouseEnter={() => onHover?.(player.playerCode)}
            onMouseLeave={() => onHover?.(null)}
            className={`flex flex-col items-center p-2 rounded-lg transition duration-300 flex-1 ml-1 mr-1 min-h-31.25 shadow-sm ${isDimmed ? 'opacity-40' : ''} ${isHovered ? 'ring-4 ring-cyan-300' : ''}
                ${isCurrent
                    ? 'bg-blue-600 shadow-xl scale-100 ring-4 text-white ring-blue-300'
                    : 'ring-2 ring-blue-600 bg-blue-900 text-blue-300'
                }`}
        >
            <div className="flex justify-between items-center w-full">
                <p className="text-[28px] font-bold font-[SVN-Gratelos_Display] uppercase truncate text-left max-w-[80%] flex items-center gap-2">
                    <span className="truncate">{player.playerName}</span>
                    {isCurrent && (
                        <Mic size={20} className="text-white inline-block" />
                    )}
                    {player.playerPower === 'star' && (
                        <Star size={20} className="text-white-400 shrink-0" />
                    )}
                    {player.playerPower === 'shield' && (
                        <Shield size={20} className="text-white-400 shrink-0" />
                    )}
                    {player.playerHasSubmittedKeyword && (
                        <>
                            <KeyRound size={16} className="text-white-400 shrink-0" />
                            {typeof player.playerKeywordCluesOpened === "number" && (
                                <span className="text-[12px] tablet:text-[14px] font-normal text-white whitespace-nowrap">
                                    {player.playerKeywordCluesOpened}
                                </span>
                            )}
                        </>
                    )}
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
