import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";
import { motion, AnimatePresence } from "framer-motion";

interface PlayerInfo {
  userCode: string;
  userName: string;
  score?: number;
  status: "online" | "offline" | "buzzed";
}

const OverlayPlayerBar: React.FC = () => {
  const { matchCode } = useParams<{ matchCode: string }>();
  const { lastMessage } = useWebSocket(matchCode || "");
  const [players, setPlayers] = useState<PlayerInfo[]>([]);

  useEffect(() => {
    if (!lastMessage) return;

    const msg = lastMessage.message ?? lastMessage;

    if (msg?.type === "send_players_info" && Array.isArray(msg.players)) {
      setPlayers(
        msg.players.map((p: any) => ({
          userCode: p.user_code || p.userCode || "",
          userName: p.user_name || p.userName || "Unknown",
          score: p.score ?? p.playerScore ?? 0,
          status: p.status || "online",
        })),
      );
    } else if (msg?.type === "player_score_updated" && Array.isArray(msg.scoreboard)) {
      setPlayers((prev) =>
        prev.map((p) => {
          const updated = (msg.scoreboard as any[]).find(
            (s) => s.userCode === p.userCode || s.user_code === p.userCode,
          );
          return updated ? { ...p, score: updated.score } : p;
        }),
      );
    } else if (msg?.type === "buzzer_winner") {
      const winnerCode = msg.user_code || "";
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          status: p.userCode === winnerCode ? "buzzed" : "online",
        })),
      );
    } else if (msg?.type === "clear_answers" || msg?.type === "clear_buzz") {
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          status: "online",
        })),
      );
    }
  }, [lastMessage]);

  if (players.length === 0) {
    return null;
  }

  return (
    <div className="bg-transparent p-2 min-w-[400px] sm:min-w-[700px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div className="flex items-center justify-center gap-3 sm:gap-4">
        <AnimatePresence>
          {players.map((player, index) => (
            <motion.div
              key={player.userCode}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: index * 0.05 }}
              className={`
                relative px-4 py-2 rounded-xl font-semibold text-sm sm:text-base
                backdrop-blur-md border transition-all duration-300
                ${
                  player.status === "buzzed"
                    ? "bg-yellow-500/90 text-black border-yellow-400 shadow-lg shadow-yellow-500/30"
                    : player.status === "online"
                      ? "bg-white/15 text-white border-white/20 shadow-lg shadow-black/20"
                      : "bg-white/5 text-white/40 border-white/10"
                }
              `}
            >
              {/* Score badge */}
              {player.score !== undefined && player.score > 0 && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full font-bold">
                  {player.score}
                </span>
              )}

              {/* Player name */}
              <span className="relative z-10">{player.userName}</span>

              {/* Buzz indicator */}
              {player.status === "buzzed" && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-400 rounded-full"
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default OverlayPlayerBar;
