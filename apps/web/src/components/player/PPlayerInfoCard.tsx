import React from "react";

interface PPlayerInfoCardProps {
  playerName?: string | null;
  playerScore?: number | null;
  playerRank?: number | null;
}

const PPlayerInfoCard: React.FC<PPlayerInfoCardProps> = ({
  playerName = "",
  playerScore = null,
  playerRank = null,
}) => {
  return (
    <div className="max-w-7xl w-full mx-auto mb-6">
      <div className="p-4 md:p-6 rounded-2xl bg-primary/40 border-2 border-primary shadow-lg flex items-center justify-between gap-6">
        <div className="text-left">
          <div className="text-3xl md:text-4xl font-semibold text-foreground font-display uppercase tracking-wide">
            {(playerName || "—").toUpperCase()}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-lg md:text-xl text-foreground/80">
            {playerRank ? `Bạn đang đứng ở vị trí thứ ${playerRank}` : "-"}
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl md:text-4xl font-bold text-foreground font-display">
            {playerScore !== null && playerScore !== undefined
              ? playerScore
              : "-"}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PPlayerInfoCard;
