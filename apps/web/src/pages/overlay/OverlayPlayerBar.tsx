import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/hooks/useWebSocket";

interface PlayerInfo {
  userCode: string;
  userName: string;
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
          status: p.status || "online",
        })),
      );
    } else if (msg?.type === "buzzer_winner") {
      const winnerCode = msg.user_code || "";
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          status: p.userCode === winnerCode ? "buzzed" : "online",
        })),
      );
    } else if (msg?.type === "clear_answers") {
      setPlayers((prev) =>
        prev.map((p) => ({
          ...p,
          status: "online",
        })),
      );
    }
  }, [lastMessage]);

  if (players.length === 0) {
    return null; // Transparent when no players
  }

  return (
    <div className="bg-transparent p-2 min-w-[400px] sm:min-w-[600px]">
      <style>{`
        body { background: transparent !important; }
        #root { background: transparent !important; }
      `}</style>

      <div className="flex items-center justify-center gap-2 sm:gap-4 flex-wrap">
        {players.map((player) => (
          <div
            key={player.userCode}
            className={`
              px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-sm sm:text-base md:text-lg"
              ${
                player.status === "buzzed"
                  ? "bg-yellow-500 text-black"
                  : player.status === "online"
                    ? "bg-white/20 text-white"
                    : "bg-white/10 text-white/50"
              }
            `}
            style={{
              textShadow: "2px 2px 4px rgba(0,0,0,0.8)",
            }}
          >
            {player.userName}
          </div>
        ))}
      </div>
    </div>
  );
};

export default OverlayPlayerBar;
