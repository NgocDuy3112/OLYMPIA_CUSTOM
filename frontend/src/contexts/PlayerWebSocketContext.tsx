import React, { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { PlayerWebSocketContext, PlayerWsContextValue } from "@/contexts/playerWsImpl";

export const PlayerWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const ws = useWebSocket(matchCode);

  const value: PlayerWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
    sendAnswer: ws.sendAnswer,
    sendBuzz: ws.sendBuzz,
  };

  return <PlayerWebSocketContext.Provider value={value}>{children}</PlayerWebSocketContext.Provider>;
};
