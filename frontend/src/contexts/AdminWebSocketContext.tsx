import React, { useEffect } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AdminWebSocketContext } from "@/contexts/adminWsImpl";
import type { AdminWsContextValue } from "@/contexts/adminWsImpl";

export const AdminWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const token = localStorage.getItem("jwtToken_admin") ?? undefined;
  const ws = useWebSocket(matchCode, token);

  const value: AdminWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  useEffect(() => {
    if (!ws.isConnected) return;
    const initialTimer = window.setTimeout(() => {
      void ws.sendMessage({ type: "request_presence" });
    }, 1500);

    const periodicTimer = window.setInterval(() => {
      void ws.sendMessage({ type: "request_presence" });
    }, 30_000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(periodicTimer);
    };
  }, [ws.isConnected, ws.sendMessage]);

  return <AdminWebSocketContext.Provider value={value}>{children}</AdminWebSocketContext.Provider>;
};

export default AdminWebSocketProvider;
