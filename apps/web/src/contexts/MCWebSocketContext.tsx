import React, { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import type { WebSocketContextValue } from "@/types/websocket";
import { useRoleSession } from "@/hooks/useRoleSession";

export const MCWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const ws = useWebSocket(matchCode);
  const { isConnected, lastMessage, sendMessage } = ws;
  const { mcCode } = useRoleSession("mc");
  const value = useMemo<WebSocketContextValue>(
    () => ({ isConnected, lastMessage, sendMessage, role: "mc" as const }),
    [isConnected, lastMessage, sendMessage],
  );

  useEffect(() => {
    if (!isConnected || !mcCode) return;
    void sendMessage({ type: "user_online", user_code: mcCode, status: "online" });
  }, [isConnected, mcCode, sendMessage]);

  useEffect(() => {
    if (!isConnected || !mcCode) return;
    const intervalId = window.setInterval(() => {
      void sendMessage({ type: "user_online", user_code: mcCode, status: "heartbeat" });
    }, 10_000);
    return () => window.clearInterval(intervalId);
  }, [isConnected, mcCode, sendMessage]);

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
};
