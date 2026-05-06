import React from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { MCWebSocketContext } from "@/contexts/mcWsImpl";
import type { McWsContextValue } from "@/contexts/mcWsImpl";

export const MCWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_mc") ?? undefined;
  const ws = useWebSocket(matchCode, token);

  const value: McWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  return <MCWebSocketContext.Provider value={value}>{children}</MCWebSocketContext.Provider>;
};
