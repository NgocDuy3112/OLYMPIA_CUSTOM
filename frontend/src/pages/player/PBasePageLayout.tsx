import React from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import { usePlayerProtection } from "@/hooks/usePlayerProtection";
import { IS_BETA } from "@/configs";


interface PBasePageLayoutProps {
    players: PlayerStatus[];
    currentPlayerCode: string;
    /** Optional override for who is currently in the lead (e.g. admin-selected turn in
     *  Về Đích Riêng). When set, the player whose `playerCode` matches this value
     *  shows the Mic icon. Falls back to `currentPlayerCode` otherwise. */
    currentTurnPlayerCode?: string | null;
    buzzerWinnerCode?: string | null;  // Show lightning icon for buzzer winner
    /** page should render its own board as children (first child) */
    children?: React.ReactNode;
}



export const PBasePageLayout: React.FC<PBasePageLayoutProps> = ({
    players,
    currentPlayerCode,
    currentTurnPlayerCode,
    buzzerWinnerCode,
    children,
}) => {
    usePlayerProtection(true);

    const effectiveCurrentCode = currentTurnPlayerCode ?? currentPlayerCode;

    return (
        <div className="flex flex-col justify-start items-center h-screen overflow-hidden p-1 sm:p-2 lg:p-4">
            {IS_BETA && (
                <div className="w-full max-w-7xl mb-2 shrink-0">
                    <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-center py-2 px-4 rounded-lg shadow-lg">
                        <span className="font-bold text-sm sm:text-base">🚀 OLYMPIA CUSTOM 3 - PHIÊN BẢN BETA</span>
                        <span className="hidden sm:inline ml-2 text-xs opacity-90">| Cảm ơn bạn đã tham gia thử nghiệm!</span>
                    </div>
                </div>
            )}

            <div className="flex gap-1 sm:gap-2 lg:gap-4 max-w-7xl w-full justify-center mt-1 sm:mt-2 lg:mt-4 shrink-0">
                {players.map(p => (
                    <PPlayerRec 
                        key={p.playerCode} 
                        player={p} 
                        isCurrent={p.playerIsTurn ?? (p.playerCode === effectiveCurrentCode)} 
                        isBuzzerWinner={p.playerCode === buzzerWinnerCode} 
                    />
                ))}
            </div>

            <div className="p-1 sm:p-2 lg:p-5 w-full flex justify-center flex-1 min-h-0 overflow-y-auto">
                <div className="w-full max-w-7xl flex flex-col gap-2 sm:gap-3 lg:gap-4">
                    {children}
                </div>
            </div>
        </div>
    );
}          