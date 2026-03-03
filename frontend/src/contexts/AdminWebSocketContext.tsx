import React, { ReactNode } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { AdminWebSocketContext, AdminWsContextValue } from "@/contexts/adminWsImpl";

export const AdminWebSocketProvider: React.FC<{ matchCode: string; children: ReactNode }> = ({
  matchCode,
  children,
}) => {
  const ws = useWebSocket(matchCode);

  const value: AdminWsContextValue = {
    isConnected: ws.isConnected,
    lastMessage: ws.lastMessage,
    sendMessage: ws.sendMessage,
    sendAnswer: ws.sendAnswer,
    sendBuzz: ws.sendBuzz,
  };

  return <AdminWebSocketContext.Provider value={value}>{children}</AdminWebSocketContext.Provider>;
};

export default AdminWebSocketProvider;
