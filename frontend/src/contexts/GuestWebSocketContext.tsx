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
  const { isConnected, lastMessage, sendMessage } = ws;
  const { guestCode } = useRoleSession("guest");

  const value = useMemo<WebSocketContextValue>(
    () => ({ isConnected, lastMessage, sendMessage }),
    [isConnected, lastMessage, sendMessage],
  );

  useEffect(() => {
    if (!isConnected || !guestCode) return;
    void sendMessage({ type: "user_online", user_code: guestCode, status: "online" });
  }, [isConnected, guestCode, sendMessage]);

  useEffect(() => {
    if (!isConnected || !guestCode) return;
    const intervalId = window.setInterval(() => {
      void sendMessage({ type: "user_online", user_code: guestCode, status: "heartbeat" });
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, [isConnected, guestCode, sendMessage]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};