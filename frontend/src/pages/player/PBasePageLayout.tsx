import React from "react";
import PPlayerRec from "@/components/player/PPlayerRec";
import PQuestionBoard from "@/components/player/PQuestionBoard";
import type { PlayerStatus } from "@/types/player";
import type { Question } from "@/types/question";



interface PBasePageLayoutProps {
    players: PlayerStatus[];
    currentPlayerCode: string;
    title: string;
    currentQuestion: Question;
    timerDuration: number;
    children?: React.ReactNode;
}



export const PBasePageLayout: React.FC<PBasePageLayoutProps> = ({
    players,
    currentPlayerCode,
    title,
    currentQuestion,
    timerDuration,
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
                    <PQuestionBoard
                        title={title}
                        question={currentQuestion}
                        timerDuration={timerDuration}
                    />
                </div>
            </div>

            <div className="w-full max-w-7xl flex flex-col gap-4">
                {children}
            </div>
        </div>
    );
}          