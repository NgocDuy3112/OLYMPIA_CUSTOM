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

  // When admin UI connects (or reconnects), request players to re-advertise presence.
  // Delayed by 1.5 s so the admin page has time to load player data from the API before
  // the player_heartbeat responses arrive (avoids a race where player_online is processed
  // while the players list is still empty).
  useEffect(() => {
    if (!ws.isConnected) return;
    const initialTimer = window.setTimeout(() => {
      void ws.sendMessage({ type: "request_presence" });
    }, 1500);
    // Re-request every 30 s so newly-arrived players are picked up without a full reconnect.
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
