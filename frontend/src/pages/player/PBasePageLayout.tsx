import React from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";


interface PBasePageLayoutProps {
    players: PlayerStatus[];
    currentPlayerCode: string;
    /** page should render its own board as children (first child) */
    children?: React.ReactNode;
}



export const PBasePageLayout: React.FC<PBasePageLayoutProps> = ({
    players,
    currentPlayerCode,
    children,
}) => {
    return (
        <div className="flex flex-col justify-start items-center min-h-screen p-4">
            <div className="flex gap-4 max-w-7xl w-full justify-center mt-5">
                {players.map(p => (
                    <PPlayerRec key={p.playerCode} player={p} isCurrent={p.playerCode === currentPlayerCode} />
                ))}
            </div>
            
            <div className="p-5 w-full flex justify-center">
                <div className="w-full max-w-7xl">
                    {children}
                </div>
            </div>
        </div>
    );
}          