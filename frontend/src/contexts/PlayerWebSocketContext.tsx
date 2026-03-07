import React, { useEffect } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { PlayerWebSocketContext } from "@/contexts/playerWsImpl";
import type { PlayerWsContextValue } from "@/contexts/playerWsImpl";
import { usePlayerSession } from "@/hooks/usePlayerSession";

export const PlayerWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const ws = useWebSocket(matchCode);

  const value: PlayerWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  // announce presence when this player's websocket connects
  const { playerCode } = usePlayerSession();
  useEffect(() => {
    if (!ws.isConnected) return;
    if (!playerCode) return;
    // fire-and-forget presence message
    void ws.sendMessage({ type: "player_online", user_code: playerCode });
  }, [ws.isConnected, playerCode, ws.sendMessage]);

  // respond to presence requests from admin: if admin reconnects they may broadcast
  // a `request_presence` message; reply with player_online so admin can rebuild connected list
  useEffect(() => {
    const raw = ws.lastMessage as { type?: string; message?: { type?: string } } | null;
    const last = raw?.message ?? raw;
    if (!last) return;
    if (last.type !== "request_presence") return;
    if (!ws.isConnected) return;
    if (!playerCode) return;
    void ws.sendMessage({ type: "player_online", user_code: playerCode });
  }, [ws.lastMessage, ws.isConnected, playerCode, ws.sendMessage]);

  return <PlayerWebSocketContext.Provider value={value}>{children}</PlayerWebSocketContext.Provider>;
};
