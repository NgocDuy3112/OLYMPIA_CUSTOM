import React, { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import type { WebSocketContextValue } from "@/types/websocket";
import { useRoleSession } from "@/hooks/useRoleSession";

export const GuestWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = sessionStorage.getItem("jwtToken_guest") ?? undefined;
  const ws = useWebSocket(matchCode, token);
  const { guestCode } = useRoleSession("guest");

  const value = useMemo<WebSocketContextValue>(
    () => ({
      isConnected: ws.isConnected,
      lastMessage: ws.lastMessage,
      sendMessage: ws.sendMessage,
    }),
    [ws.isConnected, ws.lastMessage, ws.sendMessage],
  );

  useEffect(() => {
    if (!ws.isConnected || !guestCode) return;
    void ws.sendMessage({ type: "user_online", user_code: guestCode, status: "online" });
    void ws.sendMessage({ type: "request_snapshot" });
  }, [ws.isConnected, ws.sendMessage, guestCode]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};