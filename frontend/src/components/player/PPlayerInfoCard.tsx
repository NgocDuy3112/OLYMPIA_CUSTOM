import React from "react";

interface PPlayerInfoCardProps {
    playerName?: string | null;
    playerScore?: number | null;
    playerRank?: number | null;
}

const PPlayerInfoCard: React.FC<PPlayerInfoCardProps> = ({ playerName = "", playerScore = null, playerRank = null }) => {
    return (
        <div className="max-w-7xl w-full mx-auto mb-4">
            <div className="p-3 rounded-xl bg-blue-900 border-2 border-blue-600 shadow-md flex items-center justify-between gap-4">
                <div className="text-left">
                    <div className="text-sm text-blue-200">Người chơi</div>
                    <div className="text-lg font-semibold text-white">{playerName || "—"}</div>
                </div>

                <div className="text-center">
                    <div className="text-sm text-blue-200">Xếp hạng</div>
                    <div className="text-base text-blue-200">{playerRank ? `Bạn đang đúng thứ ${playerRank}` : "-"}</div>
                </div>

                <div className="text-right">
                    <div className="text-sm text-blue-200">Điểm</div>
                    <div className="text-lg font-bold text-white">{playerScore !== null && playerScore !== undefined ? playerScore : "-"}</div>
                </div>
            </div>
        </div>
    );
};

export default PPlayerInfoCard;
