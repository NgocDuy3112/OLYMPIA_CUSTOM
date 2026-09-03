import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";

interface PlayerScore {
  userCode: string;
  userName: string;
  score: number;
}

const RANK_COLORS = [
  "from-yellow-400 to-yellow-600",  // Gold
  "from-gray-300 to-gray-500",      // Silver
  "from-orange-400 to-orange-600",  // Bronze
  "from-blue-400 to-blue-600",      // Blue
  "from-purple-400 to-purple-600",  // Purple
  "from-pink-400 to-pink-600",      // Pink
];

const OverlayScoreboard: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [scores, setScores] = useState<PlayerScore[]>([]);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;
    if (msg?.type === "player_score_updated" && Array.isArray(msg.scoreboard)) {
      setScores(
        (msg.scoreboard as any[]).map((p) => ({
          userCode: p.userCode || p.user_code || "",
          userName: p.userName || p.user_name || "Unknown",
          score: p.score || 0,
        })),
      );
    }
  }, [lastMessage]);

  if (scores.length === 0) {
    return null;
  }

  // Sort by score descending
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  return (
    <div className="bg-transparent p-3 sm:p-4 min-w-[280px] sm:min-w-[320px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div className="backdrop-blur-md bg-black/30 rounded-2xl border border-white/10 p-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-4">
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            Scoreboard
          </span>
        </div>

        {/* Scores */}
        <div className="space-y-2">
          <AnimatePresence>
            {sorted.slice(0, 6).map((player, index) => (
              <motion.div
                key={player.userCode}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3"
              >
                {/* Rank */}
                <div
                  className={`
                    w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center
                    text-xs font-bold text-white shadow-lg
                    ${RANK_COLORS[index] || RANK_COLORS[3]}
                  `}
                >
                  {index + 1}
                </div>

                {/* Name */}
                <div className="flex-1 truncate">
                  <span className="text-sm sm:text-base font-semibold text-white">
                    {player.userName}
                  </span>
                </div>

                {/* Score */}
                <motion.div
                  key={`${player.userCode}-${player.score}`}
                  initial={{ scale: 1.2, color: "#60A5FA" }}
                  animate={{ scale: 1, color: "#FFFFFF" }}
                  className="text-lg sm:text-xl font-bold tabular-nums text-white"
                >
                  {player.score.toLocaleString()}
                </motion.div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default OverlayScoreboard;
