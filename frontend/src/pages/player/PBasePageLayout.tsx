import React from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import type { PlayerStatus } from "@/types/player";
import { usePlayerProtection } from "@/hooks/usePlayerProtection";
import { HeaderBar } from "@/components/layouts/HeaderBar";
import { useGameWebSocket } from "@/hooks/useGameWebSocket";
import { useLocation } from "react-router-dom";

interface PBasePageLayoutProps {
    players: PlayerStatus[];
    currentPlayerCode: string;
    matchCode?: string;

    currentTurnPlayerCode?: string | null;
    buzzerWinnerCode?: string | null;

    children?: React.ReactNode;
}

export const PBasePageLayout: React.FC<PBasePageLayoutProps> = ({
    players,
    currentPlayerCode,
    matchCode: propMatchCode,
    currentTurnPlayerCode,
    buzzerWinnerCode,
    children,
}) => {
    usePlayerProtection(true);
    const { isConnected } = useGameWebSocket();
    const location = useLocation();
    const matchCode = propMatchCode || localStorage.getItem("matchCode") || "";

    const effectiveCurrentCode = currentTurnPlayerCode ?? currentPlayerCode;

    // Extract current phase from URL
    const extractPhase = () => {
        const path = location.pathname;
        if (path.includes("/kdc")) return "kdc";
        if (path.includes("/kdr")) return "kdr";
        if (path.includes("/bp")) return "bp";
        if (path.includes("/vdc")) return "vdc";
        if (path.includes("/vdr")) return "vdr";
        if (path.includes("/gm")) return "gm";
        if (path.includes("/vl")) return "vl";
        if (path.includes("/waiting")) return "waiting";
        return "";
    };

    const currentPhase = extractPhase();

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            {/* Header */}
            <HeaderBar
                matchCode={matchCode}
                phase={currentPhase}
                isConnected={isConnected}
            />

            {/* Player bar */}
            <div className="flex gap-1 sm:gap-2 lg:gap-4 max-w-7xl w-full justify-center p-2 sm:p-3 lg:p-4 bg-black/20 shrink-0 overflow-x-auto">
                {players.map(p => (
                    <PPlayerRec
                        key={p.playerCode}
                        player={p}
                        isCurrent={p.playerIsTurn ?? (p.playerCode === effectiveCurrentCode)}
                        isBuzzerWinner={p.playerCode === buzzerWinnerCode}
                    />
                ))}
            </div>

            {/* Main content */}
            <div className="flex-1 p-1 sm:p-2 lg:p-5 w-full flex justify-center min-h-0 overflow-y-auto">
                <div className="w-full max-w-7xl flex flex-col gap-2 sm:gap-3 lg:gap-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
