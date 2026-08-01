import React, { useMemo } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import type { WebSocketContextValue } from "@/types/websocket";

export const GuestWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_guest") ?? undefined;
  const ws = useWebSocket(matchCode, token);

  const value = useMemo<WebSocketContextValue>(
    () => ({
      isConnected: ws.isConnected,
      lastMessage: ws.lastMessage,
      sendMessage: ws.sendMessage,
    }),
    [ws.isConnected, ws.lastMessage, ws.sendMessage],
  );

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};