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
      <div className="p-4 md:p-6 rounded-2xl bg-blue-900 border-2 border-blue-600 shadow-lg flex items-center justify-between gap-6">
        <div className="text-left">
          <div className="text-3xl md:text-4xl font-semibold text-white font-[SVN-Gratelos_Display] uppercase tracking-wide">
            {(playerName || "—").toUpperCase()}
          </div>
        </div>

        <div className="flex flex-col items-center justify-center text-center">
          <div className="text-lg md:text-xl text-blue-200">
            {playerRank ? `Bạn đang đứng ở vị trí thứ ${playerRank}` : "-"}
          </div>
        </div>

        <div className="text-right">
          <div className="text-3xl md:text-4xl font-bold text-white font-[SVN-Gratelos_Display]">
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
