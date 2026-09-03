import React, { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { WebSocketContext } from "@/contexts/WebSocketContext";
import type { WebSocketContextValue } from "@/types/websocket";

export const AdminWebSocketProvider: React.FC<{
  matchCode: string;
  children: ReactNode;
}> = ({ matchCode, children }) => {
  const ws = useWebSocket(matchCode);

  const { isConnected, lastMessage, sendMessage } = ws;

  const value = useMemo<WebSocketContextValue>(
    () => ({ isConnected, lastMessage, sendMessage, role: "controller" as const }),
    [isConnected, lastMessage, sendMessage],
  );

  useEffect(() => {
    if (!isConnected) return;
    const initialTimer = window.setTimeout(() => {
      void sendMessage({ type: "request_presence" });
    }, 1500);

    const periodicTimer = window.setInterval(() => {
      void sendMessage({ type: "request_presence" });
    }, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, [isConnected, sendMessage]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export default AdminWebSocketProvider;
