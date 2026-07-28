import React from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { GuestWebSocketContext } from "@/contexts/guestWsImpl";
import type { GuestWsContextValue } from "@/contexts/guestWsImpl";

export const GuestWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_guest") ?? undefined;
  const ws = useWebSocket(matchCode, token);

  const value: GuestWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  return <GuestWebSocketContext.Provider value={value}>{children}</GuestWebSocketContext.Provider>;
};