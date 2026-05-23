import React from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";


interface PBasePageLayoutProps {
    players: PlayerStatus[];
    currentPlayerCode: string;
    buzzerWinnerCode?: string | null;  // Show lightning icon for buzzer winner
    /** page should render its own board as children (first child) */
    children?: React.ReactNode;
}



export const PBasePageLayout: React.FC<PBasePageLayoutProps> = ({
    players,
    currentPlayerCode,
    buzzerWinnerCode,
    children,
}) => {
    return (
        <div className="flex flex-col justify-start items-center h-screen overflow-hidden p-2 lg:p-4">
            <div className="flex gap-2 lg:gap-4 max-w-7xl w-full justify-center mt-2 lg:mt-4">
                {players.map(p => (
                    <PPlayerRec key={p.playerCode} player={p} isCurrent={p.playerIsTurn ?? (p.playerCode === currentPlayerCode)} isBuzzerWinner={p.playerCode === buzzerWinnerCode} />
                ))}
            </div>

            <div className="p-2 lg:p-5 w-full flex justify-center flex-1 min-h-0 overflow-y-auto">
                <div className="w-full max-w-7xl flex flex-col gap-4">
                    {children}
                </div>
            </div>
        </div>
    );
}          