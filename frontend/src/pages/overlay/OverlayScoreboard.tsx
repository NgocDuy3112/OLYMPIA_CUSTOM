import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";

interface PlayerScore {
  userCode: string;
  userName: string;
  score: number;
}

const RANK_ICONS = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

const OverlayScoreboard: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [scores, setScores] = useState<PlayerScore[]>([]);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;
    if (msg?.type === "player_score_updated" && Array.isArray(msg.scoreboard)) {
      setScores(msg.scoreboard as PlayerScore[]);
    }
  }, [lastMessage]);

  if (scores.length === 0) {
    return null; // Transparent when no data
  }

  return (
    <div className="bg-transparent p-2 sm:p-4 font-bold text-white min-w-[200px] sm:min-w-[280px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div className="space-y-2">
        {scores.slice(0, 6).map((player, index) => (
          <div
            key={player.userCode}
            className="flex items-center justify-between text-lg sm:text-xl md:text-2xl"
            style={{
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            <div className="flex items-center gap-2 truncate">
              <span>{RANK_ICONS[index] || `${index + 1}.`}</span>
              <span className="truncate">{player.userName}</span>
            </div>
            <span className="tabular-nums ml-4">{player.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OverlayScoreboard;
