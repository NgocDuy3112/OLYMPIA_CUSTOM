import React, { useEffect } from "react";
import type { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AdminWebSocketContext } from "@/contexts/adminWsImpl";
import type { AdminWsContextValue } from "@/contexts/adminWsImpl";

export const AdminWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const ws = useWebSocket(matchCode);

  const value: AdminWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
  };

  // When admin UI connects (or reconnects), request players to re-advertise presence
  useEffect(() => {
    if (!ws.isConnected) return;
    // Fire-and-forget: ask all clients to announce presence so admin UI can rebuild connected state
    void ws.sendMessage({ type: "request_presence" });
  }, [ws.isConnected, ws.sendMessage]);

  return <AdminWebSocketContext.Provider value={value}>{children}</AdminWebSocketContext.Provider>;
};

export default AdminWebSocketProvider;
